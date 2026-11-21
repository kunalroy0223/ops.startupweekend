import "server-only";
import type { Actor } from "@/domain/authz";
import type { Task, TaskComment } from "@/domain/types";
import { enqueueEvent, writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { serverEnv } from "../env";
import { adminDb } from "../firebase-admin";
import { forbidden, notFound } from "../http";
import { canAccessTask } from "./tasks";

export interface TaskActivityItem {
  id: string;
  actorUserId: string;
  action: string;
  summary: string;
  createdAt: string;
}

export async function getTaskDetail(actor: Actor, id: string) {
  const ref = col("tasks").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const task = fromDoc<Task>(snap);
  if (task.organizationId !== serverEnv().ORGANIZATION_ID || task.archivedAt || !await canAccessTask(actor, task)) return null;
  const [comments, activity] = await Promise.all([
    ref.collection("comments").orderBy("createdAt", "asc").limit(100).get(),
    ref.collection("activity").orderBy("createdAt", "desc").limit(100).get(),
  ]);
  return {
    task,
    comments: comments.docs.map(d => fromDoc<TaskComment & { authorName?: string }>(d)).filter(comment => !comment.deletedAt),
    activity: activity.docs.map(d => fromDoc<TaskActivityItem>(d)),
    canManage: actor.role === "admin" || actor.role === "lead",
    canComment: true,
  };
}

export async function addTaskComment(actor: Actor, taskId: string, body: string, mentionedUserIds: string[], requestId: string) {
  const taskRef = col("tasks").doc(taskId);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) throw notFound("Task not found.");
  const task = fromDoc<Task>(taskSnap);
  if (task.archivedAt) throw notFound("Task not found.");
  if (!await canAccessTask(actor, task)) throw forbidden();
  const mentions = [...new Set(mentionedUserIds)].filter(uid => uid !== actor.uid);
  const profiles = await Promise.all(mentions.map(uid => col("users").doc(uid).get()));
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i]!;
    if (!profile.exists || profile.data()?.status !== "active" || profile.data()?.organizationId !== serverEnv().ORGANIZATION_ID) throw forbidden("One of the selected people is not an active Inhub user.");
    const target = fromDoc<{ uid: string; organizationId: string; role: Actor["role"]; status: Actor["status"]; email: string; displayName: string }>(profile, "uid");
    if (!await canAccessTask(target, task)) throw forbidden("You can only mention people who can access this task.");
  }
  const commentRef = taskRef.collection("comments").doc();
  const activityRef = taskRef.collection("activity").doc();
  await adminDb().runTransaction(async tx => {
    const current = await tx.get(taskRef);
    if (!current.exists) throw notFound("Task not found.");
    const liveTask = fromDoc<Task>(current);
    if (liveTask.archivedAt) throw notFound("Task not found.");
    if (!await canAccessTask(actor, liveTask)) throw forbidden();
    tx.create(commentRef, {
      organizationId: task.organizationId, workspaceId: task.workspaceId, taskId,
      authorUserId: actor.uid, authorName: actor.displayName, body,
      mentionedUserIds: mentions, createdAt: now(),
    });
    tx.create(activityRef, { actorUserId: actor.uid, action: "commented", summary: `${actor.displayName} added a comment`, createdAt: now() });
    tx.update(taskRef, { updatedAt: now(), updatedBy: actor.uid });
    writeAudit(tx, { actorUserId: actor.uid, action: "task.comment_added", resourceType: "task", resourceId: taskId, subjectUserIds: [task.accountableUserId, ...task.collaboratorUserIds, ...mentions], workspaceId: task.workspaceId, after: { commentId: commentRef.id, mentionedUserIds: mentions }, requestId });
    enqueueEvent(tx, {
      eventType: "TASK_COMMENTED", actorUserId: actor.uid, resourceType: "task", resourceId: taskId,
      workspaceId: task.workspaceId,
      payload: {
        taskId, title: task.title,
        userIds: [task.accountableUserId, ...(task.collaboratorUserIds ?? [])],
        mentionedUserIds: mentions,
        preview: body.slice(0, 180),
      },
    });
  });
}


export async function deleteTaskComment(actor: Actor, taskId: string, commentId: string, requestId: string) {
  const taskRef = col("tasks").doc(taskId);
  const commentRef = taskRef.collection("comments").doc(commentId);
  await adminDb().runTransaction(async tx => {
    const [taskSnap, commentSnap] = await Promise.all([tx.get(taskRef), tx.get(commentRef)]);
    if (!taskSnap.exists || !commentSnap.exists) throw notFound("Comment not found.");
    const task = fromDoc<Task>(taskSnap);
    const comment = fromDoc<TaskComment>(commentSnap);
    if (task.organizationId !== serverEnv().ORGANIZATION_ID || comment.organizationId !== task.organizationId || task.archivedAt) throw notFound("Comment not found.");
    if (!await canAccessTask(actor, task)) throw forbidden();
    if (comment.authorUserId !== actor.uid && actor.role !== "admin" && actor.role !== "lead") throw forbidden("Only the comment author or an authorised manager can delete this comment.");
    if (comment.deletedAt) return;
    tx.update(commentRef, { deletedAt: now() });
    const activityRef = taskRef.collection("activity").doc();
    tx.create(activityRef, { actorUserId: actor.uid, action: "comment_deleted", summary: `${actor.displayName} deleted a comment`, createdAt: now() });
    tx.update(taskRef, { updatedAt: now(), updatedBy: actor.uid });
    writeAudit(tx, { actorUserId: actor.uid, action: "task.comment_deleted", resourceType: "task", resourceId: taskId, subjectUserIds: [task.accountableUserId, ...task.collaboratorUserIds], workspaceId: task.workspaceId, before: { commentId, authorUserId: comment.authorUserId }, after: { deletedAt: "deleted" }, requestId });
  });
}

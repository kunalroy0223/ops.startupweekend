import "server-only";
import { Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { isAdmin, type Actor } from "@/domain/authz";
import type { Project, Task, TaskStatus } from "@/domain/types";
import { slugify } from "@/domain/validation";
import { enqueueEvent, writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { ApiError, conflict, forbidden, notFound } from "../http";
import { getScope } from "../scope";

const org = () => serverEnv().ORGANIZATION_ID;
function recordTaskActivity(tx: Transaction, taskId: string, actorUserId: string, action: string, summary: string) {
  const ref = col("tasks").doc(taskId).collection("activity").doc();
  tx.create(ref, { actorUserId, action, summary, createdAt: now() });
}

async function assertTaskRelationships(actor: Actor, taskId: string | undefined, workspaceId: string, parentTaskId?: string, dependencyIds: string[] = []) {
  if (parentTaskId) {
    if (parentTaskId === taskId) throw new ApiError(422, "task_parent_cycle", "A task cannot be its own parent.");
    let cursor: string | undefined = parentTaskId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === taskId) throw new ApiError(422, "task_parent_cycle", "This parent would create a circular subtask relationship.");
      if (seen.has(cursor)) throw conflict("existing_parent_cycle", "The selected parent already has a circular relationship.");
      seen.add(cursor);
      const snap: DocumentSnapshot = await col("tasks").doc(cursor).get();
      if (!snap.exists || snap.data()?.workspaceId !== workspaceId || snap.data()?.archivedAt != null) throw new ApiError(422, "invalid_parent", "Choose an active parent task in this workspace.");
      const parent: Task = fromDoc<Task>(snap);
      if (!await canAccessTask(actor, parent)) throw forbidden("The selected parent task is outside your permitted scope.");
      cursor = parent.parentTaskId;
    }
  }
  const unique = [...new Set(dependencyIds)];
  if (unique.length > 20) throw new ApiError(422, "too_many_dependencies", "A task can have up to 20 dependencies.");
  for (const dependencyId of unique) {
    if (dependencyId === taskId) throw new ApiError(422, "task_dependency_cycle", "A task cannot depend on itself.");
    const dependency = await col("tasks").doc(dependencyId).get();
    if (!dependency.exists || dependency.data()?.workspaceId !== workspaceId || dependency.data()?.archivedAt != null) throw new ApiError(422, "invalid_dependency", "Every dependency must be an active task in the same workspace.");
    if (!await canAccessTask(actor, fromDoc<Task>(dependency))) throw forbidden("A dependency is outside your permitted scope.");
    const pending = [dependencyId];
    const visited = new Set<string>();
    while (pending.length) {
      const currentId = pending.pop()!;
      if (currentId === taskId) throw new ApiError(422, "task_dependency_cycle", "These dependencies would create a circular dependency.");
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const current = await col("tasks").doc(currentId).get();
      if (!current.exists) continue;
      const next = current.data()?.dependencyIds;
      if (Array.isArray(next)) for (const id of next) if (typeof id === "string") pending.push(id);
      if (visited.size > 500) throw conflict("dependency_graph_too_large", "This dependency graph is too large to validate safely.");
    }
  }
}

const activeUser = async (uid: string) => {
  const snap = await col("users").doc(uid).get();
  return snap.exists && snap.data()?.status === "active" && snap.data()?.organizationId === org();
};

export async function canAccessTask(actor: Actor, task: Task): Promise<boolean> {
  if (task.organizationId !== org()) return false;
  if (isAdmin(actor)) return true;
  const scope = await getScope(actor.uid);
  if (actor.role === "lead") {
    // An unscoped task belongs to Admin-only space; workspace membership alone
    // must not grant a Lead organisation-wide task visibility.
    if (!task.teamId && !task.workstreamId) return false;
    return scope.workspaceIds.has(task.workspaceId) &&
      (!task.teamId || scope.leadTeamIds.has(task.teamId) || scope.teamIdsViaLedWorkstreams.has(task.teamId)) &&
      (!task.workstreamId || scope.leadWorkstreamIds.has(task.workstreamId));
  }
  if (task.accountableUserId === actor.uid || task.collaboratorUserIds.includes(actor.uid)) return true;
  if (task.teamId && scope.memberTeamIds.has(task.teamId)) return true;
  return false;
}

async function assertTaskScope(actor: Actor, workspaceId: string, teamId?: string, workstreamId?: string) {
  if (isAdmin(actor)) return;
  if (actor.role !== "lead") throw forbidden("Only Admins and Leads can create or manage tasks.");
  const scope = await getScope(actor.uid);
  if (!scope.workspaceIds.has(workspaceId)) throw forbidden("This workspace is outside your assigned scope.");
  if (teamId && !scope.leadTeamIds.has(teamId) && !scope.teamIdsViaLedWorkstreams.has(teamId)) throw forbidden("This team is outside your assigned scope.");
  if (workstreamId && !scope.leadWorkstreamIds.has(workstreamId)) throw forbidden("This workstream is outside your assigned scope.");
}

export async function listProjects(actor: Actor, includeArchived = false): Promise<Project[]> {
  const snap = await col("projects").where("organizationId", "==", org()).get();
  const rows = snap.docs.map((d) => fromDoc<Project>(d)).filter((project) => includeArchived ? project.status === "archived" : project.status === "active");
  if (isAdmin(actor)) return rows.sort((a,b) => a.name.localeCompare(b.name));
  const scope = await getScope(actor.uid);
  return rows.filter((p) => {
    if (!scope.workspaceIds.has(p.workspaceId)) return false;
    if (actor.role === "lead") return (!!p.teamId && (scope.leadTeamIds.has(p.teamId) || scope.teamIdsViaLedWorkstreams.has(p.teamId))) || (!!p.workstreamId && scope.leadWorkstreamIds.has(p.workstreamId));
    return (!!p.teamId && scope.memberTeamIds.has(p.teamId)) || (!!p.workstreamId && scope.memberWorkstreamIds.has(p.workstreamId));
  }).sort((a,b) => a.name.localeCompare(b.name));
}

export async function createProject(actor: Actor, input: {
  workspaceId: string; workstreamId?: string; teamId?: string; name: string; description?: string;
}, requestId: string): Promise<string> {
  if (!isAdmin(actor) && !input.teamId && !input.workstreamId) throw forbidden("Associate this project with a team or workstream within your scope.");
  await assertTaskScope(actor, input.workspaceId, input.teamId, input.workstreamId);
  if (!await col("workspaces").doc(input.workspaceId).get().then(s => s.exists && s.data()?.status === "active")) {
    throw new ApiError(422, "invalid_workspace", "Choose an active workspace.");
  }
  const [team, stream] = await Promise.all([
    input.teamId ? col("teams").doc(input.teamId).get() : null,
    input.workstreamId ? col("workstreams").doc(input.workstreamId).get() : null,
  ]);
  if (team && (!team.exists || team.data()?.workspaceId !== input.workspaceId || team.data()?.status !== "active")) throw new ApiError(422, "invalid_team", "Choose an active team in this workspace.");
  if (stream && (!stream.exists || stream.data()?.workspaceId !== input.workspaceId || stream.data()?.status !== "active")) throw new ApiError(422, "invalid_workstream", "Choose an active workstream in this workspace.");
  if (input.teamId && input.workstreamId) {
    const link = await col("workstreamTeams").doc(`${input.workstreamId}_${input.teamId}`).get();
    if (!link.exists || link.data()?.status !== "active") throw new ApiError(422, "team_workstream_mismatch", "The selected team is not linked to the selected workstream.");
  }
  const ref = col("projects").doc();
  const slug = slugify(input.name) || ref.id;
  await adminDb().runTransaction(async (tx) => {
    const dup = await tx.get(col("projects").where("workspaceId", "==", input.workspaceId).where("slug", "==", slug).limit(1));
    if (!dup.empty) throw conflict("project_name_taken", "A project with this name already exists in this workspace.");
    tx.create(ref, {
      organizationId: org(), workspaceId: input.workspaceId, workstreamId: input.workstreamId ?? null,
      teamId: input.teamId ?? null, name: input.name, slug, description: input.description ?? null,
      status: "active", createdBy: actor.uid, createdAt: now(), updatedAt: now(),
    });
    writeAudit(tx, { actorUserId: actor.uid, action: "project.created", resourceType: "project", resourceId: ref.id, workspaceId: input.workspaceId, after: { name: input.name, teamId: input.teamId ?? null, workstreamId: input.workstreamId ?? null }, requestId });
  });
  return ref.id;
}



export async function updateProject(actor: Actor, id: string, input: { name: string; description?: string }, requestId: string) {
  const ref = col("projects").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Project not found.");
  const project = fromDoc<Project>(snap);
  await assertTaskScope(actor, project.workspaceId, project.teamId, project.workstreamId);
  const slug = slugify(input.name) || id;
  await adminDb().runTransaction(async tx => {
    const [current, duplicate] = await Promise.all([
      tx.get(ref), tx.get(col("projects").where("workspaceId", "==", project.workspaceId).where("slug", "==", slug).limit(1)),
    ]);
    if (!current.exists) throw notFound("Project not found.");
    if (!duplicate.empty && duplicate.docs[0]!.id !== id) throw conflict("project_name_taken", "A project with this name already exists in this workspace.");
    tx.update(ref, { name: input.name, slug, description: input.description ?? null, updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "project.updated", resourceType: "project", resourceId: id, workspaceId: project.workspaceId, before: { name: project.name, description: project.description ?? null }, after: { name: input.name, description: input.description ?? null }, requestId });
  });
}

export async function setProjectArchived(actor: Actor, id: string, archived: boolean, requestId: string) {
  const ref = col("projects").doc(id);
  await adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Project not found.");
    const project = fromDoc<Project>(snap);
    await assertTaskScope(actor, project.workspaceId, project.teamId, project.workstreamId);
    if (project.status === (archived ? "archived" : "active")) return;
    tx.update(ref, { status: archived ? "archived" : "active", archivedAt: archived ? now() : null, updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: archived ? "project.archived" : "project.restored", resourceType: "project", resourceId: id, workspaceId: project.workspaceId, before: { status: project.status }, after: { status: archived ? "archived" : "active" }, requestId });
  });
}

/** Soft-delete a task from active work views while preserving its audit trail. */
export async function deleteTask(actor: Actor, id: string, requestId: string) {
  const ref = col("tasks").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Task not found.");
  const task = fromDoc<Task>(snap);
  if (!await canAccessTask(actor, task)) throw forbidden();
  if (!isAdmin(actor) && actor.role !== "lead") throw forbidden("Only Admins and Leads can delete tasks.");
  await assertTaskScope(actor, task.workspaceId, task.teamId, task.workstreamId);
  if (task.archivedAt) return;

  await adminDb().runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) throw notFound("Task not found.");
    const latest = fromDoc<Task>(current);
    if (latest.archivedAt) return;
    if (!await canAccessTask(actor, latest)) throw forbidden();
    const [children, dependents] = await Promise.all([
      tx.get(col("tasks").where("parentTaskId", "==", id).limit(100)),
      tx.get(col("tasks").where("dependencyIds", "array-contains", id).limit(100)),
    ]);
    const hasActiveRelationship = [...children.docs, ...dependents.docs].some((doc) =>
      doc.data().organizationId === org() && doc.data().archivedAt == null,
    );
    if (hasActiveRelationship) {
      throw conflict("task_has_dependencies", "This task is linked to active subtasks or dependent tasks. Remove or reassign those relationships before deleting it.");
    }
    tx.update(ref, { archivedAt: now(), updatedBy: actor.uid, updatedAt: now() });
    recordTaskActivity(tx, id, actor.uid, "deleted", `${actor.displayName} deleted this task`);
    writeAudit(tx, { actorUserId: actor.uid, action: "task.deleted", resourceType: "task", resourceId: id, subjectUserIds: [latest.accountableUserId, ...latest.collaboratorUserIds], workspaceId: latest.workspaceId, before: { title: latest.title, status: latest.status }, after: { archivedAt: "deleted" }, requestId });
  });
}

export async function restoreTask(actor: Actor, id: string, requestId: string) {
  const ref = col("tasks").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Task not found.");
    const task = fromDoc<Task>(snap);
    if (!await canAccessTask(actor, task)) throw forbidden();
    if (!isAdmin(actor) && actor.role !== "lead") throw forbidden("Only Admins and Leads can restore tasks.");
    await assertTaskScope(actor, task.workspaceId, task.teamId, task.workstreamId);
    if (!task.archivedAt) return;
    await assertTaskRelationships(actor, id, task.workspaceId, task.parentTaskId, task.dependencyIds);
    tx.update(ref, { archivedAt: null, updatedBy: actor.uid, updatedAt: now() });
    recordTaskActivity(tx, id, actor.uid, "restored", `${actor.displayName} restored this task`);
    writeAudit(tx, { actorUserId: actor.uid, action: "task.restored", resourceType: "task", resourceId: id, subjectUserIds: [task.accountableUserId, ...task.collaboratorUserIds], workspaceId: task.workspaceId, before: { archivedAt: "deleted" }, after: { archivedAt: null }, requestId });
  });
}

export async function listTasks(actor: Actor, includeArchived = false): Promise<Task[]> {
  let query = col("tasks").where("organizationId", "==", org());
  if (!includeArchived) query = query.where("archivedAt", "==", null);
  const snap = await query.limit(500).get();
  const rows = snap.docs.map((d) => fromDoc<Task>(d)).filter((task) => includeArchived ? !!task.archivedAt : !task.archivedAt);
  const scope = isAdmin(actor) ? null : await getScope(actor.uid);
  const visible = rows.filter((task) => {
    if (task.organizationId !== org()) return false;
    if (isAdmin(actor)) return true;
    if (!scope) return false;
    if (actor.role === "lead") {
      if (!task.teamId && !task.workstreamId) return false;
      return scope.workspaceIds.has(task.workspaceId) &&
        (!task.teamId || scope.leadTeamIds.has(task.teamId) || scope.teamIdsViaLedWorkstreams.has(task.teamId)) &&
        (!task.workstreamId || scope.leadWorkstreamIds.has(task.workstreamId));
    }
    if (task.accountableUserId === actor.uid || task.collaboratorUserIds.includes(actor.uid)) return true;
    return !!task.teamId && scope.memberTeamIds.has(task.teamId);
  });
  return visible.sort((a,b) => {
    const da = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
    const db = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
    return da - db || b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function createTask(actor: Actor, input: {
  workspaceId: string; projectId?: string; workstreamId?: string; teamId?: string; title: string;
  description?: string; acceptanceCriteria?: string; accountableUserId: string; collaboratorUserIds: string[];
  priority: "low" | "medium" | "high" | "urgent"; dueAt?: string; parentTaskId?: string; dependencyIds: string[]; referenceLinks?: string[];
}, requestId: string): Promise<string> {
  if (!isAdmin(actor) && !input.teamId && !input.workstreamId && !input.projectId) throw forbidden("Associate this task with a project, team or workstream within your scope.");
  let teamId = input.teamId;
  let workstreamId = input.workstreamId;
  await assertTaskScope(actor, input.workspaceId, teamId, workstreamId);
  if (!await activeUser(input.accountableUserId)) throw new ApiError(422, "invalid_assignee", "Choose an active Inhub user as the accountable owner.");
  for (const uid of input.collaboratorUserIds) if (!await activeUser(uid)) throw new ApiError(422, "invalid_collaborator", "All collaborators must be active Inhub users.");
  if (input.projectId) {
    const project = await col("projects").doc(input.projectId).get();
    if (!project.exists || project.data()?.status !== "active" || project.data()?.workspaceId !== input.workspaceId) throw new ApiError(422, "invalid_project", "Choose an active project in this workspace.");
    const pd = project.data()!;
    if (!isAdmin(actor)) await assertTaskScope(actor, input.workspaceId, pd.teamId ?? undefined, pd.workstreamId ?? undefined);
    if (pd.teamId && teamId && pd.teamId !== teamId) throw new ApiError(422, "project_team_mismatch", "The task team must match the project's team association.");
    if (pd.workstreamId && workstreamId && pd.workstreamId !== workstreamId) throw new ApiError(422, "project_workstream_mismatch", "The task workstream must match the project's workstream association.");
    teamId ??= pd.teamId ?? undefined;
    workstreamId ??= pd.workstreamId ?? undefined;
  }
  await assertTaskScope(actor, input.workspaceId, teamId, workstreamId);
  if (!isAdmin(actor) && !teamId && !workstreamId) {
    throw forbidden("Tasks managed by Leads must be associated with a team or workstream in their scope.");
  }
  if (teamId) {
    const team = await col("teams").doc(teamId).get();
    if (!team.exists || team.data()?.workspaceId !== input.workspaceId || team.data()?.status !== "active") throw new ApiError(422, "invalid_team", "Choose an active team in this workspace.");
    if (!isAdmin(actor)) {
      const membership = await col("teamMemberships").doc(`${teamId}_${input.accountableUserId}`).get();
      if (!membership.exists || membership.data()?.status !== "active") throw new ApiError(422, "assignee_not_in_team", "The accountable owner must be an active member of the selected team.");
    }
  }
  if (workstreamId) {
    const stream = await col("workstreams").doc(workstreamId).get();
    if (!stream.exists || stream.data()?.workspaceId !== input.workspaceId || stream.data()?.status !== "active") throw new ApiError(422, "invalid_workstream", "Choose an active workstream in this workspace.");
    if (!isAdmin(actor)) {
      const membership = await col("workstreamMemberships").doc(`${workstreamId}_${input.accountableUserId}`).get();
      if (!membership.exists || membership.data()?.status !== "active") throw new ApiError(422, "assignee_not_in_workstream", "The accountable owner must be an active member of the selected workstream.");
    }
  }
  if (teamId && workstreamId) {
    const link = await col("workstreamTeams").doc(`${workstreamId}_${teamId}`).get();
    if (!link.exists || link.data()?.status !== "active") throw new ApiError(422, "team_workstream_mismatch", "The selected team is not linked to the selected workstream.");
  }
  await assertTaskRelationships(actor, undefined, input.workspaceId, input.parentTaskId, input.dependencyIds);
  const ref = col("tasks").doc();
  const status: TaskStatus = "assigned";
  await adminDb().runTransaction(async (tx) => {
    tx.create(ref, {
      organizationId: org(), workspaceId: input.workspaceId, projectId: input.projectId ?? null,
      workstreamId: workstreamId ?? null, teamId: teamId ?? null, title: input.title,
      description: input.description ?? null, acceptanceCriteria: input.acceptanceCriteria ?? null,
      accountableUserId: input.accountableUserId, collaboratorUserIds: [...new Set(input.collaboratorUserIds.filter(x => x !== input.accountableUserId))],
      status, priority: input.priority, dueAt: input.dueAt ? Timestamp.fromDate(new Date(input.dueAt)) : null,
      parentTaskId: input.parentTaskId ?? null, dependencyIds: [...new Set(input.dependencyIds)], referenceLinks: [...new Set(input.referenceLinks ?? [])],
      createdBy: actor.uid, updatedBy: actor.uid, createdAt: now(), updatedAt: now(), archivedAt: null,
    });
    recordTaskActivity(tx, ref.id, actor.uid, "created", `${actor.displayName} created this task`);
    writeAudit(tx, { actorUserId: actor.uid, action: "task.created", resourceType: "task", resourceId: ref.id, subjectUserIds: [input.accountableUserId, ...input.collaboratorUserIds], workspaceId: input.workspaceId, after: { title: input.title, status, priority: input.priority, accountableUserId: input.accountableUserId, teamId: teamId ?? null, workstreamId: workstreamId ?? null }, requestId });
    enqueueEvent(tx, { eventType: "TASK_ASSIGNED", actorUserId: actor.uid, resourceType: "task", resourceId: ref.id, workspaceId: input.workspaceId, payload: { taskId: ref.id, userId: input.accountableUserId, title: input.title, teamId: teamId ?? null, workstreamId: workstreamId ?? null } });
  });
  return ref.id;
}

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ["assigned", "cancelled"],
  assigned: ["backlog", "in_progress", "cancelled"],
  in_progress: ["in_review", "blocked", "cancelled"],
  in_review: ["in_progress", "completed", "cancelled"],
  completed: ["in_progress"],
  blocked: ["in_progress"],
  cancelled: ["in_progress"],
};

export async function changeTaskStatus(actor: Actor, id: string, next: TaskStatus, reason: string | undefined, requestId: string) {
  const ref = col("tasks").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Task not found.");
    const task = fromDoc<Task>(snap);
    if (task.archivedAt) throw conflict("task_deleted", "Restore this task before changing its status.");
    if (!await canAccessTask(actor, task)) throw forbidden();
    const manager = isAdmin(actor) || actor.role === "lead";
    const memberOwn = actor.role === "member" && task.accountableUserId === actor.uid;
    if (memberOwn) {
      const allowed = (task.status === "assigned" && next === "in_progress") ||
        (task.status === "in_progress" && ["in_review", "blocked"].includes(next)) ||
        (task.status === "blocked" && next === "in_progress");
      if (!allowed) throw forbidden("You can only update the status of your assigned task using the available transitions.");
    } else if (!manager) throw forbidden();
    if (!TRANSITIONS[task.status].includes(next)) throw conflict("invalid_task_transition", `A task cannot move from ${task.status.replaceAll("_"," ")} to ${next.replaceAll("_"," ")}.`);
    if ((next === "cancelled" || task.status === "completed" || task.status === "cancelled") && !reason?.trim()) {
      throw new ApiError(422, "reason_required", "A reason is required to cancel or reopen this task.", { reason: "Enter a reason" });
    }
    tx.update(ref, { status: next, updatedBy: actor.uid, updatedAt: now(), completedAt: next === "completed" ? now() : null, ...(reason ? { lastTransitionReason: reason } : {}) });
    recordTaskActivity(tx, id, actor.uid, "status_changed", `${actor.displayName} changed status from ${task.status} to ${next}${reason ? ` · ${reason}` : ""}`);
    writeAudit(tx, { actorUserId: actor.uid, action: "task.status_changed", resourceType: "task", resourceId: id, subjectUserIds: [task.accountableUserId, ...task.collaboratorUserIds], workspaceId: task.workspaceId, before: { status: task.status }, after: { status: next, reason: reason ?? null }, requestId });
    enqueueEvent(tx, { eventType: "TASK_STATUS_CHANGED", actorUserId: actor.uid, resourceType: "task", resourceId: id, workspaceId: task.workspaceId, payload: { taskId: id, title: task.title, status: next, userId: task.accountableUserId } });
  });
}

export async function updateTask(actor: Actor, id: string, input: Record<string, unknown>, requestId: string) {
  const ref = col("tasks").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Task not found.");
    const task = fromDoc<Task>(snap);
    if (task.archivedAt) throw conflict("task_deleted", "Restore this task before editing it.");
    if (!await canAccessTask(actor, task)) throw forbidden();
    const manager = isAdmin(actor) || actor.role === "lead";
    if (!manager) throw forbidden("Only Admins and Leads can change task details.");
    await assertTaskScope(actor, task.workspaceId, task.teamId, task.workstreamId);
    if (typeof input.teamId === "string") await assertTaskScope(actor, task.workspaceId, input.teamId, typeof input.workstreamId === "string" ? input.workstreamId : task.workstreamId);
    if (typeof input.workstreamId === "string") await assertTaskScope(actor, task.workspaceId, typeof input.teamId === "string" ? input.teamId : task.teamId, input.workstreamId);
    const patch: Record<string, unknown> = { updatedBy: actor.uid, updatedAt: now() };
    for (const key of ["title","description","acceptanceCriteria","accountableUserId","collaboratorUserIds","priority","teamId","workstreamId","projectId","parentTaskId","dependencyIds","referenceLinks"] as const) {
      if (key in input) patch[key] = input[key] ?? null;
    }
    if ("dueAt" in input) patch.dueAt = input.dueAt ? Timestamp.fromDate(new Date(String(input.dueAt))) : null;
    if ("parentTaskId" in input || "dependencyIds" in input) await assertTaskRelationships(actor, id, task.workspaceId, typeof input.parentTaskId === "string" ? input.parentTaskId : undefined, Array.isArray(input.dependencyIds) ? input.dependencyIds as string[] : task.dependencyIds);
    if (patch.accountableUserId && !await activeUser(String(patch.accountableUserId))) throw new ApiError(422, "invalid_assignee", "Choose an active Inhub user.");
    if (Array.isArray(patch.collaboratorUserIds)) {
      for (const uid of patch.collaboratorUserIds as string[]) if (!await activeUser(uid)) throw new ApiError(422, "invalid_collaborator", "All collaborators must be active Inhub users.");
    }
    const effectiveTeamId = typeof patch.teamId === "string" ? patch.teamId : patch.teamId === null ? undefined : task.teamId;
    const effectiveWorkstreamId = typeof patch.workstreamId === "string" ? patch.workstreamId : patch.workstreamId === null ? undefined : task.workstreamId;
    const effectiveOwnerId = String(patch.accountableUserId ?? task.accountableUserId);
    if (!isAdmin(actor) && !effectiveTeamId && !effectiveWorkstreamId) {
      throw forbidden("Keep this task associated with a team or workstream within your scope.");
    }
    await assertTaskScope(actor, task.workspaceId, effectiveTeamId, effectiveWorkstreamId);
    if (effectiveTeamId && (typeof patch.teamId === "string" || typeof patch.accountableUserId === "string")) {
      const team = await col("teams").doc(effectiveTeamId).get();
      if (!team.exists || team.data()?.workspaceId !== task.workspaceId || team.data()?.status !== "active") throw new ApiError(422, "invalid_team", "Choose an active team in this workspace.");
      if (!isAdmin(actor)) {
        const membership = await col("teamMemberships").doc(`${effectiveTeamId}_${effectiveOwnerId}`).get();
        if (!membership.exists || membership.data()?.status !== "active") throw new ApiError(422, "assignee_not_in_team", "The accountable owner must be an active member of the selected team.");
      }
    }
    if (effectiveWorkstreamId && (typeof patch.workstreamId === "string" || typeof patch.accountableUserId === "string")) {
      const stream = await col("workstreams").doc(effectiveWorkstreamId).get();
      if (!stream.exists || stream.data()?.workspaceId !== task.workspaceId || stream.data()?.status !== "active") throw new ApiError(422, "invalid_workstream", "Choose an active workstream in this workspace.");
      if (!isAdmin(actor)) {
        const membership = await col("workstreamMemberships").doc(`${effectiveWorkstreamId}_${effectiveOwnerId}`).get();
        if (!membership.exists || membership.data()?.status !== "active") throw new ApiError(422, "assignee_not_in_workstream", "The accountable owner must be an active member of the selected workstream.");
      }
    }
    if (effectiveTeamId && effectiveWorkstreamId && (typeof patch.teamId === "string" || typeof patch.workstreamId === "string")) {
      const link = await col("workstreamTeams").doc(`${effectiveWorkstreamId}_${effectiveTeamId}`).get();
      if (!link.exists || link.data()?.status !== "active") throw new ApiError(422, "team_workstream_mismatch", "The selected team is not linked to the selected workstream.");
    }
    const effectiveProjectId = "projectId" in patch ? (typeof patch.projectId === "string" ? patch.projectId : undefined) : task.projectId;
    const projectScopeChanged = "projectId" in patch || "teamId" in patch || "workstreamId" in patch;
    if (effectiveProjectId && projectScopeChanged) {
      const project = await col("projects").doc(effectiveProjectId).get();
      if (!project.exists || project.data()?.workspaceId !== task.workspaceId || ("projectId" in patch && project.data()?.status !== "active")) throw new ApiError(422, "invalid_project", "Choose an active project in this workspace.");
      const pd = project.data()!;
      if (!isAdmin(actor)) await assertTaskScope(actor, task.workspaceId, pd.teamId ?? undefined, pd.workstreamId ?? undefined);
      if (pd.teamId && pd.teamId !== effectiveTeamId) throw new ApiError(422, "project_team_mismatch", "The task team must match the project's team association.");
      if (pd.workstreamId && pd.workstreamId !== effectiveWorkstreamId) throw new ApiError(422, "project_workstream_mismatch", "The task workstream must match the project's workstream association.");
    }
    tx.update(ref, patch);
    recordTaskActivity(tx, id, actor.uid, "updated", `${actor.displayName} updated task details`);
    writeAudit(tx, { actorUserId: actor.uid, action: "task.updated", resourceType: "task", resourceId: id, subjectUserIds: [task.accountableUserId, ...(typeof patch.accountableUserId === "string" ? [patch.accountableUserId] : [])], workspaceId: task.workspaceId, before: { title: task.title, priority: task.priority, dueAt: task.dueAt ?? null }, after: { ...patch }, requestId });
    if (typeof patch.accountableUserId === "string" && patch.accountableUserId !== task.accountableUserId) {
      enqueueEvent(tx, { eventType: "TASK_ASSIGNED", actorUserId: actor.uid, resourceType: "task", resourceId: id, workspaceId: task.workspaceId, payload: {
        taskId: id, userId: patch.accountableUserId, previousUserId: task.accountableUserId,
        title: String(patch.title ?? task.title),
        teamId: typeof patch.teamId === "string" ? patch.teamId : "teamId" in patch ? null : task.teamId ?? null,
        workstreamId: typeof patch.workstreamId === "string" ? patch.workstreamId : "workstreamId" in patch ? null : task.workstreamId ?? null,
      } });
    }
  });
}

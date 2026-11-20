import "server-only";
import type { Actor, Scope } from "@/domain/authz";
import { isAdmin } from "@/domain/authz";
import type { Task, WorkReport, WorkReportEntry, WorkReportReview, WorkReportVersion } from "@/domain/types";
import { enqueueEvent, writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { serverEnv } from "../env";
import { adminDb } from "../firebase-admin";
import { ApiError, conflict, forbidden, notFound } from "../http";
import { getScope } from "../scope";
import { canAccessTask } from "./tasks";

const org = () => serverEnv().ORGANIZATION_ID;
const reports = () => col("workReports");
const reportRef = (id: string) => reports().doc(id);
const editable = (status: WorkReport["status"]) => status === "draft" || status === "needs_revision";
const reportIdFor = (workspaceId: string, uid: string, date: string) => `${workspaceId}_${uid}_${date}`;

async function assertWorkspaceAndContext(actor: Actor, input: { workspaceId: string; teamId?: string; workstreamId?: string }) {
  const scope = await getScope(actor.uid);
  if (!isAdmin(actor) && !scope.workspaceIds.has(input.workspaceId)) throw forbidden("This workspace is outside your assigned scope.");
  const ws = await col("workspaces").doc(input.workspaceId).get();
  if (!ws.exists || ws.data()?.status !== "active") throw new ApiError(422, "invalid_workspace", "Choose an active workspace.");
  if (input.teamId) {
    const [team, membership] = await Promise.all([
      col("teams").doc(input.teamId).get(),
      col("teamMemberships").doc(`${input.teamId}_${actor.uid}`).get(),
    ]);
    if (!team.exists || team.data()?.status !== "active" || team.data()?.workspaceId !== input.workspaceId) throw new ApiError(422, "invalid_team", "Choose an active team in this workspace.");
    if (!isAdmin(actor) && (!membership.exists || membership.data()?.status !== "active")) throw forbidden("You can only report against a team you belong to.");
  }
  if (input.workstreamId) {
    const [stream, membership] = await Promise.all([
      col("workstreams").doc(input.workstreamId).get(),
      col("workstreamMemberships").doc(`${input.workstreamId}_${actor.uid}`).get(),
    ]);
    if (!stream.exists || stream.data()?.status !== "active" || stream.data()?.workspaceId !== input.workspaceId) throw new ApiError(422, "invalid_workstream", "Choose an active workstream in this workspace.");
    if (!isAdmin(actor) && (!membership.exists || membership.data()?.status !== "active")) throw forbidden("You can only report against a workstream you belong to.");
  }
  if (input.teamId && input.workstreamId) {
    const link = await col("workstreamTeams").doc(`${input.workstreamId}_${input.teamId}`).get();
    if (!link.exists || link.data()?.status !== "active") throw new ApiError(422, "team_workstream_mismatch", "The selected team is not linked to the selected workstream.");
  }
}

function canReviewWithScope(actor: Actor, scope: Scope, report: WorkReport): boolean {
  if (isAdmin(actor)) return true;
  if (actor.role !== "lead" || !scope.workspaceIds.has(report.workspaceId)) return false;
  const leadsTeam = !!report.teamId && (scope.leadTeamIds.has(report.teamId) || scope.teamIdsViaLedWorkstreams.has(report.teamId));
  const leadsStream = !!report.workstreamId && scope.leadWorkstreamIds.has(report.workstreamId);
  return leadsTeam || leadsStream;
}

export async function canReviewReport(actor: Actor, report: WorkReport): Promise<boolean> {
  if (isAdmin(actor)) return true;
  return canReviewWithScope(actor, await getScope(actor.uid), report);
}

async function requireAuthor(actor: Actor, report: WorkReport) {
  if (report.userId !== actor.uid) throw forbidden("Only the report author can change this report.");
  if (!editable(report.status)) throw conflict("report_locked", "This report is locked after submission. A report can only be edited when it is a draft or needs revision.");
}

export async function listMyReports(actor: Actor): Promise<WorkReport[]> {
  const snap = await reports().where("organizationId", "==", org()).where("userId", "==", actor.uid).orderBy("reportDate", "desc").limit(100).get();
  return snap.docs.map(d => fromDoc<WorkReport>(d)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
}

export type WorkReportReviewQueueItem = WorkReport & { userDisplayName: string };

export async function listReviewQueue(actor: Actor): Promise<WorkReportReviewQueueItem[]> {
  if (actor.role !== "lead" && !isAdmin(actor)) return [];
  const base = reports().where("organizationId", "==", org());
  const snap = isAdmin(actor)
    ? await base.orderBy("reportDate", "desc").limit(300).get()
    : await base.where("status", "==", "submitted").orderBy("submittedAt", "desc").limit(300).get();
  const rows = snap.docs.map(d => fromDoc<WorkReport>(d)).filter(r => r.userId !== actor.uid);
  const scope = isAdmin(actor) ? null : await getScope(actor.uid);
  const visible = scope ? rows.filter(r => canReviewWithScope(actor, scope, r)) : rows;
  const ids = [...new Set(visible.map(r => r.userId))];
  const profiles = ids.length ? await adminDb().getAll(...ids.map(id => col("users").doc(id))) : [];
  const names = new Map(profiles.map(p => [p.id, String(p.data()?.displayName ?? "Inhub member")]));
  return visible.map(r => ({ ...r, userDisplayName: names.get(r.userId) ?? "Inhub member" }));
}

export async function createOrOpenReport(actor: Actor, input: { workspaceId: string; reportDate: string; teamId?: string; workstreamId?: string }, requestId: string): Promise<string> {
  await assertWorkspaceAndContext(actor, input);
  const id = reportIdFor(input.workspaceId, actor.uid, input.reportDate);
  const ref = reportRef(id);
  await adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const current = fromDoc<WorkReport>(snap);
      if (!editable(current.status)) throw conflict("report_already_submitted", "A report for this workspace and date has already been submitted.");
      if ((current.teamId ?? undefined) !== (input.teamId ?? undefined) || (current.workstreamId ?? undefined) !== (input.workstreamId ?? undefined)) {
        throw conflict("report_context_locked", "The reporting team or workstream cannot be changed after the report is created.");
      }
      return;
    }
    tx.create(ref, {
      organizationId: org(), workspaceId: input.workspaceId, userId: actor.uid, reportDate: input.reportDate,
      teamId: input.teamId ?? null, workstreamId: input.workstreamId ?? null,
      status: "draft", version: 0, createdAt: now(), updatedAt: now(),
    });
    writeAudit(tx, { actorUserId: actor.uid, action: "work_report.created", resourceType: "workReport", resourceId: id, subjectUserIds: [actor.uid], workspaceId: input.workspaceId, after: { reportDate: input.reportDate, teamId: input.teamId ?? null, workstreamId: input.workstreamId ?? null }, requestId });
  });
  return id;
}

export type WorkReportReviewDetail = WorkReportReview & { reviewerDisplayName: string };

export interface WorkReportDetail {
  report: WorkReport;
  entries: WorkReportEntry[];
  reviews: WorkReportReviewDetail[];
  versions: WorkReportVersion[];
  authorDisplayName: string;
  canEdit: boolean;
  canReview: boolean;
}

export async function getWorkReportDetail(actor: Actor, id: string): Promise<WorkReportDetail | null> {
  const snap = await reportRef(id).get();
  if (!snap.exists) return null;
  const report = fromDoc<WorkReport>(snap);
  if (report.organizationId !== org()) return null;
  const canEdit = report.userId === actor.uid && editable(report.status);
  const canReview = report.userId !== actor.uid && await canReviewReport(actor, report);
  if (report.userId !== actor.uid && !canReview) return null;
  const [entriesSnap, reviewsSnap, versionsSnap, authorSnap] = await Promise.all([
    reportRef(id).collection("entries").orderBy("createdAt", "asc").get(),
    reportRef(id).collection("reviews").orderBy("createdAt", "desc").limit(100).get(),
    reportRef(id).collection("versions").orderBy("version", "desc").get(),
    col("users").doc(report.userId).get(),
  ]);
  const reviews = reviewsSnap.docs.map(d => fromDoc<WorkReportReview>(d));
  const reviewerIds = [...new Set(reviews.map(review => review.reviewerId))];
  const reviewerProfiles = reviewerIds.length
    ? await adminDb().getAll(...reviewerIds.map(uid => col("users").doc(uid)))
    : [];
  const reviewerNames = new Map(reviewerProfiles.map(profile => [profile.id, String(profile.data()?.displayName ?? "Inhub reviewer")]));
  return {
    report,
    entries: entriesSnap.docs.map(d => fromDoc<WorkReportEntry>(d)),
    reviews: reviews.map(review => ({ ...review, reviewerDisplayName: reviewerNames.get(review.reviewerId) ?? "Inhub reviewer" })),
    versions: versionsSnap.docs.map(d => fromDoc<WorkReportVersion>(d)),
    authorDisplayName: String(authorSnap.data()?.displayName ?? "Inhub member"),
    canEdit,
    canReview: canReview && report.status === "submitted",
  };
}

export async function addWorkReportEntry(actor: Actor, reportId: string, input: Omit<WorkReportEntry, "id" | "createdAt" | "updatedAt">, requestId: string): Promise<string> {
  const ref = reportRef(reportId);
  const reportSnap = await ref.get();
  if (!reportSnap.exists) throw notFound("Work report not found.");
  const report = fromDoc<WorkReport>(reportSnap);
  await requireAuthor(actor, report);
  if (input.taskId) {
    const taskSnap = await col("tasks").doc(input.taskId).get();
    if (!taskSnap.exists) throw new ApiError(422, "invalid_task", "Choose an existing task.");
    const task = fromDoc<Task>(taskSnap);
    if (task.workspaceId !== report.workspaceId || !await canAccessTask(actor, task)) throw forbidden("You cannot link a task outside your permitted workspace scope.");
  }
  const entryRef = ref.collection("entries").doc();
  await adminDb().runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists) throw notFound("Work report not found.");
    await requireAuthor(actor, fromDoc<WorkReport>(current));
    tx.create(entryRef, { ...input, taskId: input.taskId ?? null, createdAt: now(), updatedAt: now() });
    tx.update(ref, { updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "work_report.entry_added", resourceType: "workReport", resourceId: reportId, subjectUserIds: [actor.uid], workspaceId: report.workspaceId, after: { entryId: entryRef.id, taskId: input.taskId ?? null, activityTitle: input.activityTitle }, requestId });
  });
  return entryRef.id;
}

export async function updateWorkReportEntry(actor: Actor, reportId: string, entryId: string, input: Omit<WorkReportEntry, "id" | "createdAt" | "updatedAt">, requestId: string) {
  const ref = reportRef(reportId);
  const entryRef = ref.collection("entries").doc(entryId);
  const [reportSnap, entrySnap] = await Promise.all([ref.get(), entryRef.get()]);
  if (!reportSnap.exists || !entrySnap.exists) throw notFound("Report or entry not found.");
  const report = fromDoc<WorkReport>(reportSnap);
  await requireAuthor(actor, report);
  if (input.taskId) {
    const taskSnap = await col("tasks").doc(input.taskId).get();
    if (!taskSnap.exists) throw new ApiError(422, "invalid_task", "Choose an existing task.");
    const task = fromDoc<Task>(taskSnap);
    if (task.workspaceId !== report.workspaceId || !await canAccessTask(actor, task)) throw forbidden("You cannot link a task outside your permitted workspace scope.");
  }
  await adminDb().runTransaction(async tx => {
    const [current, currentEntry] = await Promise.all([tx.get(ref), tx.get(entryRef)]);
    if (!current.exists || !currentEntry.exists) throw notFound("Report or entry not found.");
    await requireAuthor(actor, fromDoc<WorkReport>(current));
    tx.update(entryRef, { ...input, taskId: input.taskId ?? null, updatedAt: now() });
    tx.update(ref, { updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "work_report.entry_updated", resourceType: "workReport", resourceId: reportId, subjectUserIds: [actor.uid], workspaceId: report.workspaceId, after: { entryId, activityTitle: input.activityTitle }, requestId });
  });
}

export async function deleteWorkReportEntry(actor: Actor, reportId: string, entryId: string, requestId: string) {
  const ref = reportRef(reportId);
  const entryRef = ref.collection("entries").doc(entryId);
  await adminDb().runTransaction(async tx => {
    const [reportSnap, entrySnap] = await Promise.all([tx.get(ref), tx.get(entryRef)]);
    if (!reportSnap.exists || !entrySnap.exists) throw notFound("Report or entry not found.");
    const report = fromDoc<WorkReport>(reportSnap);
    await requireAuthor(actor, report);
    tx.delete(entryRef);
    tx.update(ref, { updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "work_report.entry_deleted", resourceType: "workReport", resourceId: reportId, subjectUserIds: [actor.uid], workspaceId: report.workspaceId, before: { entryId }, requestId });
  });
}

export async function submitWorkReport(actor: Actor, reportId: string, requestId: string) {
  const ref = reportRef(reportId);
  await adminDb().runTransaction(async tx => {
    const [reportSnap, entriesSnap] = await Promise.all([tx.get(ref), tx.get(ref.collection("entries").orderBy("createdAt", "asc"))]);
    if (!reportSnap.exists) throw notFound("Work report not found.");
    const report = fromDoc<WorkReport>(reportSnap);
    await requireAuthor(actor, report);
    const entries = entriesSnap.docs.map(d => fromDoc<WorkReportEntry>(d));
    if (!entries.length) throw new ApiError(422, "empty_report", "Add at least one work entry before submitting your report.");
    const version = (report.version ?? 0) + 1;
    const submittedAt = now();
    const versionRef = ref.collection("versions").doc(String(version));
    tx.create(versionRef, {
      version, submittedBy: actor.uid, submittedAt,
      entries: entries.map(entry => {
        const snapshot = { ...entry };
        // Submission snapshots capture work content, not mutable entry timestamps.
        Reflect.deleteProperty(snapshot, "createdAt");
        Reflect.deleteProperty(snapshot, "updatedAt");
        return snapshot;
      }),
    });
    tx.update(ref, { status: "submitted", version, submittedAt, reviewerId: null, reviewerComment: null, reviewedAt: null, updatedAt: submittedAt });
    writeAudit(tx, { actorUserId: actor.uid, action: "work_report.submitted", resourceType: "workReport", resourceId: reportId, subjectUserIds: [actor.uid], workspaceId: report.workspaceId, after: { status: "submitted", version, entryCount: entries.length }, requestId });
    enqueueEvent(tx, { eventType: "WORK_REPORT_SUBMITTED", actorUserId: actor.uid, resourceType: "workReport", resourceId: reportId, workspaceId: report.workspaceId, payload: { reportId, userId: actor.uid, reportDate: report.reportDate, version, teamId: report.teamId ?? null, workstreamId: report.workstreamId ?? null } });
  });
}

export async function reviewWorkReport(actor: Actor, reportId: string, input: { decision: "approved" | "needs_revision"; comment?: string }, requestId: string) {
  const ref = reportRef(reportId);
  await adminDb().runTransaction(async tx => {
    const reportSnap = await tx.get(ref);
    if (!reportSnap.exists) throw notFound("Work report not found.");
    const report = fromDoc<WorkReport>(reportSnap);
    if (report.userId === actor.uid) throw forbidden("You cannot review your own report.");
    if (!await canReviewReport(actor, report)) throw forbidden("This report is outside your review scope.");
    if (report.status !== "submitted") throw conflict("report_not_submitted", "Only submitted reports can be reviewed.");
    if (input.decision === "needs_revision" && !input.comment?.trim()) throw new ApiError(422, "review_comment_required", "Add a comment explaining the requested revision.");
    const reviewRef = ref.collection("reviews").doc();
    const reviewedAt = now();
    tx.create(reviewRef, { reviewerId: actor.uid, decision: input.decision, comment: input.comment?.trim() ?? null, version: report.version, createdAt: reviewedAt });
    tx.update(ref, {
      status: input.decision, reviewerId: actor.uid, reviewerComment: input.comment?.trim() ?? null,
      reviewedAt, updatedAt: reviewedAt,
    });
    writeAudit(tx, { actorUserId: actor.uid, action: input.decision === "approved" ? "work_report.approved" : "work_report.revision_requested", resourceType: "workReport", resourceId: reportId, subjectUserIds: [report.userId], workspaceId: report.workspaceId, before: { status: report.status }, after: { status: input.decision, comment: input.comment?.trim() ?? null, version: report.version }, requestId });
    enqueueEvent(tx, { eventType: input.decision === "approved" ? "WORK_REPORT_APPROVED" : "WORK_REPORT_NEEDS_REVISION", actorUserId: actor.uid, resourceType: "workReport", resourceId: reportId, workspaceId: report.workspaceId, payload: { reportId, userId: report.userId, decision: input.decision, reportDate: report.reportDate, version: report.version } });
  });
}

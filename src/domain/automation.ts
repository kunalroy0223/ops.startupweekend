import { createHash } from "node:crypto";

export interface AutomationRunIdentity {
  ruleId: string;
  ruleKey: string;
  targetType: string;
  targetId: string;
  recipientUserId: string;
  occurrenceKey: string;
  workspaceId?: string;
}

/** Stable across worker invocations; never includes the invocation timestamp. */
export function automationRunDocumentId(identity: AutomationRunIdentity, organizationId: string): string {
  return createHash("sha256")
    .update(JSON.stringify([
      organizationId,
      identity.ruleId,
      identity.ruleKey,
      identity.targetType,
      identity.targetId,
      identity.recipientUserId,
      identity.occurrenceKey,
      identity.workspaceId ?? null,
    ]))
    .digest("hex");
}

export const AUTOMATION_OPEN_TASK_STATUSES = new Set(["backlog", "assigned", "in_progress", "blocked"]);

export function isAutomationTaskOpen(task: { status: string; archivedAt?: string | null }): boolean {
  return AUTOMATION_OPEN_TASK_STATUSES.has(task.status) && !task.archivedAt;
}

export function isTaskDueSoon(dueAt: string, nowMs: number, leadMinutes: number): boolean {
  const dueMs = Date.parse(dueAt);
  return Number.isFinite(dueMs) && dueMs > nowMs && dueMs <= nowMs + leadMinutes * 60_000;
}

export function isTaskOverdue(dueAt: string, nowMs: number): boolean {
  const dueMs = Date.parse(dueAt);
  return Number.isFinite(dueMs) && dueMs <= nowMs;
}

/** One due-soon occurrence per exact deadline; changing a deadline permits a new reminder. */
export function dueSoonOccurrenceKey(dueAt: string): string {
  return `due:${new Date(dueAt).toISOString()}`;
}

/** Stable repeat buckets prevent duplicate overdue reminders within an interval. */
export function overdueOccurrenceKey(dueAt: string, nowMs: number, repeatHours: number): string {
  const dueMs = Date.parse(dueAt);
  if (!Number.isFinite(dueMs)) throw new Error("invalid_due_at");
  const intervalMs = repeatHours * 60 * 60_000;
  const bucket = Math.max(0, Math.floor((nowMs - dueMs) / intervalMs));
  return `overdue:${new Date(dueMs).toISOString()}:${bucket}`;
}

export function automationRuleDocumentId(organizationId: string, ruleKey: string): string {
  return createHash("sha256").update(`${organizationId}\u0000${ruleKey}`).digest("hex");
}

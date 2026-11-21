import "server-only";
import { FieldValue, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { AutomationRule, AutomationRun, Task, UserProfile } from "@/domain/types";
import {
  automationRuleDocumentId,
  dueSoonOccurrenceKey,
  isAutomationTaskOpen,
  isTaskDueSoon,
  isTaskOverdue,
  overdueOccurrenceKey,
  type AutomationRunIdentity,
} from "@/domain/automation";
import { nextRetryDelayMs } from "@/domain/events";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { AUTOMATION_RULES, isAutomationRuleKey, isAutomationRuleExecutable, validateAutomationRuleConfig, type AutomationRuleKey } from "./registry";
import { claimAutomationRun, finishAutomationRun } from "./runs";

const MAX_SCAN = 500;
const ALREADY_EXISTS = 6;
const isAlreadyExists = (error: unknown) => (error as { code?: number })?.code === ALREADY_EXISTS;
const org = () => serverEnv().ORGANIZATION_ID;

type RuleRow = AutomationRule & { ruleKey: AutomationRuleKey };
export interface AutomationProcessSummary {
  scanned: number;
  claimed: number;
  completed: number;
  skipped: number;
  retry: number;
  failed: number;
  unsupportedRules: number;
}

function bump(summary: AutomationProcessSummary, key: keyof AutomationProcessSummary, amount = 1) {
  summary[key] += amount;
}

function errorCode(error: unknown): string {
  const value = error instanceof Error ? error.message : "automation_execution_error";
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 64) || "automation_execution_error";
}

async function finishWithRetry(run: AutomationRun, error: unknown): Promise<"retry" | "failed"> {
  const delay = nextRetryDelayMs(run.attempts);
  if (delay === null) {
    await finishAutomationRun(run.id, run.attempts, { status: "failed", errorCode: errorCode(error) });
    return "failed";
  }
  await finishAutomationRun(run.id, run.attempts, { status: "retry", nextRetryAt: new Date(Date.now() + delay), errorCode: errorCode(error) });
  return "retry";
}

async function markSkipped(run: AutomationRun, reason: string): Promise<void> {
  await finishAutomationRun(run.id, run.attempts, { status: "skipped", errorCode: reason });
}

async function executeTaskRun(run: AutomationRun, rule: RuleRow): Promise<"completed" | "skipped" | "retry" | "failed"> {
  try {
    const [taskSnap, userSnap, ruleSnap] = await Promise.all([
      col("tasks").doc(run.targetId).get(),
      col("users").doc(run.recipientUserId).get(),
      col("automationRules").doc(run.ruleId).get(),
    ]);
    if (!ruleSnap.exists || ruleSnap.data()?.enabled !== true) {
      await markSkipped(run, "rule_disabled");
      return "skipped";
    }
    if (!taskSnap.exists) {
      await markSkipped(run, "task_missing");
      return "skipped";
    }
    const task = fromDoc<Task>(taskSnap);
    const user = userSnap.exists ? fromDoc<UserProfile>(userSnap, "uid") : null;
    if (task.organizationId !== org() || task.accountableUserId !== run.recipientUserId || !isAutomationTaskOpen(task)) {
      await markSkipped(run, "task_no_longer_eligible");
      return "skipped";
    }
    if (!user || user.organizationId !== org() || user.status !== "active") {
      await markSkipped(run, "recipient_inactive");
      return "skipped";
    }
    const dueAt = task.dueAt;
    if (!dueAt) {
      await markSkipped(run, "task_deadline_removed");
      return "skipped";
    }

    const config = validateAutomationRuleConfig(run.ruleKey, rule.config);
    const matches = run.ruleKey === "task_due_soon"
      ? dueSoonOccurrenceKey(dueAt) === run.occurrenceKey && isTaskDueSoon(dueAt, Date.now(), Number(config.leadMinutes))
      : run.ruleKey === "task_overdue"
        ? overdueOccurrenceKey(dueAt, Date.now(), Number(config.repeatHours)) === run.occurrenceKey && isTaskOverdue(dueAt, Date.now())
        : false;
    if (!matches) {
      await markSkipped(run, "task_no_longer_matches_rule");
      return "skipped";
    }

    const eventType = run.ruleKey === "task_due_soon" ? "TASK_DUE_SOON" : "TASK_OVERDUE";
    const eventId = `automation_${run.id}`;
    const eventRef = col("domainEvents").doc(eventId);
    try {
      await eventRef.create({
        organizationId: org(),
        eventType,
        resourceType: "task",
        resourceId: task.id,
        workspaceId: task.workspaceId,
        payload: { taskId: task.id, userId: task.accountableUserId, title: task.title, dueAt, automationRunId: run.id },
        status: "pending",
        attempts: 0,
        createdAt: now(),
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    await finishAutomationRun(run.id, run.attempts, { status: "completed", domainEventId: eventId });
    return "completed";
  } catch (error) {
    return finishWithRetry(run, error);
  }
}

async function processOccurrence(
  identity: AutomationRunIdentity,
  rule: RuleRow,
  summary: AutomationProcessSummary,
): Promise<void> {
  bump(summary, "scanned");
  const run = await claimAutomationRun(identity);
  if (!run) return;
  bump(summary, "claimed");
  const outcome = await executeTaskRun(run, rule);
  bump(summary, outcome);
}

async function queryTaskCandidates(
  rule: RuleRow,
  limit: number,
): Promise<{ docs: QueryDocumentSnapshot[]; hasMore: boolean }> {
  const nowIso = new Date().toISOString();
  let query = col("tasks").where("organizationId", "==", org());
  if (rule.ruleKey === "task_due_soon") {
    const leadMinutes = Number(rule.config.leadMinutes);
    query = query.where("dueAt", ">", nowIso).where("dueAt", "<=", new Date(Date.now() + leadMinutes * 60_000).toISOString()).orderBy("dueAt", "asc");
  } else if (rule.ruleKey === "task_overdue") {
    query = query.where("dueAt", "<=", nowIso).orderBy("dueAt", "asc");
    if (rule.overdueCursorTaskId) {
      const cursor = await col("tasks").doc(rule.overdueCursorTaskId).get();
      if (cursor.exists) query = query.startAfter(cursor);
    }
  } else {
    return { docs: [], hasMore: false };
  }
  const pageSize = Math.min(Math.max(limit, 1), MAX_SCAN);
  const snap = await query.limit(pageSize + 1).get();
  const docs = snap.docs.slice(0, pageSize);
  return { docs, hasMore: snap.docs.length > pageSize };
}

async function processRule(rule: RuleRow, limit: number, summary: AutomationProcessSummary): Promise<void> {
  if (!isAutomationRuleExecutable(rule.ruleKey)) {
    bump(summary, "unsupportedRules");
    return;
  }
  const page = await queryTaskCandidates(rule, limit);
  for (const doc of page.docs) {
    const task = fromDoc<Task>(doc);
    if (task.organizationId !== org() || !task.dueAt || !isAutomationTaskOpen(task)) continue;
    if (!task.accountableUserId) continue;
    const nowMs = Date.now();
    const matchesWindow = rule.ruleKey === "task_due_soon"
      ? isTaskDueSoon(task.dueAt, nowMs, Number(rule.config.leadMinutes))
      : rule.ruleKey === "task_overdue"
        ? isTaskOverdue(task.dueAt, nowMs)
        : false;
    if (!matchesWindow) continue;
    const identity: AutomationRunIdentity = {
      ruleId: rule.id,
      ruleKey: rule.ruleKey,
      targetType: "task",
      targetId: task.id,
      recipientUserId: task.accountableUserId,
      occurrenceKey: rule.ruleKey === "task_due_soon"
        ? dueSoonOccurrenceKey(task.dueAt)
        : overdueOccurrenceKey(task.dueAt, Date.now(), Number(rule.config.repeatHours)),
      workspaceId: task.workspaceId,
    };
    await processOccurrence(identity, rule, summary);
  }

  // Overdue tasks recur; rotate through a stable ordered scan so the first page
  // cannot monopolise every daily run when an organisation has >500 open tasks.
  if (rule.ruleKey === "task_overdue") {
    const last = page.docs.at(-1);
    await col("automationRules").doc(rule.id).update({
      overdueCursorTaskId: page.hasMore && last ? last.id : FieldValue.delete(),
    });
  }
}

async function processDueRetries(limit: number, summary: AutomationProcessSummary): Promise<void> {
  const organizationId = org();
  const pageSize = Math.min(Math.max(limit, 1), 100);
  const [dueRetries, staleProcessing] = await Promise.all([
    col("automationRuns")
      .where("organizationId", "==", organizationId)
      .where("status", "==", "retry")
      .where("nextRetryAt", "<=", now())
      .orderBy("nextRetryAt", "asc")
      .limit(pageSize)
      .get(),
    col("automationRuns")
      .where("organizationId", "==", organizationId)
      .where("status", "==", "processing")
      .where("leaseUntil", "<=", now())
      .orderBy("leaseUntil", "asc")
      .limit(pageSize)
      .get(),
  ]);

  const runs = new Map<string, AutomationRun>();
  for (const doc of [...dueRetries.docs, ...staleProcessing.docs]) {
    runs.set(doc.id, fromDoc<AutomationRun>(doc));
  }
  for (const existing of runs.values()) {
    if (existing.targetType !== "task" || !isAutomationRuleKey(existing.ruleKey) || !isAutomationRuleExecutable(existing.ruleKey)) continue;
    const ref = col("automationRules").doc(existing.ruleId);
    const ruleSnap = await ref.get();
    if (!ruleSnap.exists || ruleSnap.data()?.enabled !== true) {
      const claimed = await claimAutomationRun(existing);
      if (claimed) {
        bump(summary, "claimed");
        await markSkipped(claimed, "rule_disabled");
        bump(summary, "skipped");
      }
      continue;
    }
    const rule = { ...fromDoc<AutomationRule>(ruleSnap), ruleKey: existing.ruleKey } as RuleRow;
    const claimed = await claimAutomationRun(existing);
    if (!claimed) continue;
    bump(summary, "claimed");
    const outcome = await executeTaskRun(claimed, rule);
    bump(summary, outcome);
  }
}

export async function processScheduledAutomations(limit = 250): Promise<AutomationProcessSummary> {
  const summary: AutomationProcessSummary = { scanned: 0, claimed: 0, completed: 0, skipped: 0, retry: 0, failed: 0, unsupportedRules: 0 };
  await processDueRetries(Math.min(limit, 100), summary);
  const rulesSnap = await col("automationRules").where("organizationId", "==", org()).where("enabled", "==", true).get();
  const rules = rulesSnap.docs
    .map((doc) => fromDoc<AutomationRule & { ruleKey: string }>(doc))
    .filter((rule): rule is AutomationRule & { ruleKey: AutomationRuleKey } => isAutomationRuleKey(rule.ruleKey));
  for (const stored of rules) {
    const definition = AUTOMATION_RULES[stored.ruleKey];
    const rule = {
      ...stored,
      config: validateAutomationRuleConfig(stored.ruleKey, stored.config),
      triggerType: definition.triggerType,
    } as RuleRow;
    await processRule(rule, limit, summary);
  }
  return summary;
}

/** Admin-triggered replay for a single failed run. The worker still revalidates its target and scope. */
export async function requeueAutomationRunDocument(runId: string): Promise<boolean> {
  const ref = col("automationRuns").doc(runId);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.organizationId !== org() || snap.data()?.status !== "failed") return false;
    tx.update(ref, {
      status: "retry",
      attempts: 0,
      nextRetryAt: now(),
      leaseUntil: FieldValue.delete(),
      completedAt: FieldValue.delete(),
      lastErrorCode: FieldValue.delete(),
      updatedAt: now(),
    });
    return true;
  });
}

export function automationRuleIdFor(organizationId: string, ruleKey: string): string {
  return automationRuleDocumentId(organizationId, ruleKey);
}

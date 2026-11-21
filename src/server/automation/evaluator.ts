import "server-only";
import { FieldValue, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { AutomationRule, AutomationRun, CrmCampaign, CrmCampaignMember, CrmContact, Task, UserProfile } from "@/domain/types";
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
import { crmFollowUpOccurrenceKey, crmReplyWaitingOccurrenceKey, isCrmFollowUpDue, isCrmReplyWaiting, CRM_CAMPAIGN_MEMBER_TERMINAL_STAGES } from "@/domain/crm-workflows";
import { col, fromDoc, now, tsFromMs } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { AUTOMATION_RULES, isAutomationRuleKey, isAutomationRuleExecutable, validateAutomationRuleConfig, type AutomationRuleKey } from "./registry";
import { claimAutomationRun, finishAutomationRun } from "./runs";

const MAX_SCAN = 500;
const ALREADY_EXISTS = 6;
const isAlreadyExists = (error: unknown) => (error as { code?: number })?.code === ALREADY_EXISTS;
const org = () => serverEnv().ORGANIZATION_ID;

type RuleRow = AutomationRule & { ruleKey: string };
type StoredAutomationRule = AutomationRule & { ruleKey: AutomationRuleKey };
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

async function executeCrmCampaignMemberRun(run: AutomationRun, rule: RuleRow): Promise<"completed" | "skipped" | "retry" | "failed"> {
  try {
    const [memberSnap, userSnap, ruleSnap] = await Promise.all([
      col("crmCampaignMembers").doc(run.targetId).get(),
      col("users").doc(run.recipientUserId).get(),
      col("automationRules").doc(run.ruleId).get(),
    ]);
    if (!ruleSnap.exists || ruleSnap.data()?.enabled !== true) {
      await markSkipped(run, "rule_disabled");
      return "skipped";
    }
    if (!memberSnap.exists) {
      await markSkipped(run, "crm_campaign_member_missing");
      return "skipped";
    }
    const member = fromDoc<CrmCampaignMember>(memberSnap);
    const [campaignSnap, contactSnap] = await Promise.all([
      col("crmCampaigns").doc(member.campaignId).get(),
      col("crmContacts").doc(member.contactId).get(),
    ]);
    const user = userSnap.exists ? fromDoc<UserProfile>(userSnap, "uid") : null;
    if (!campaignSnap.exists || !contactSnap.exists) {
      await markSkipped(run, "crm_campaign_or_contact_missing");
      return "skipped";
    }
    const campaign = fromDoc<CrmCampaign>(campaignSnap);
    const contact = fromDoc<CrmContact>(contactSnap);
    if (member.organizationId !== org() || member.assignedToUserId !== run.recipientUserId || campaign.organizationId !== org() || campaign.status !== "active" || contact.organizationId !== org() || contact.status !== "active" || contact.doNotContact) {
      await markSkipped(run, "crm_target_no_longer_eligible");
      return "skipped";
    }
    if (!user || user.organizationId !== org() || user.status !== "active") {
      await markSkipped(run, "recipient_inactive");
      return "skipped";
    }
    const config = validateAutomationRuleConfig(run.ruleKey, rule.config);
    const nowMs = Date.now();
    let eventType: "CRM_FOLLOW_UP_DUE" | "CRM_REPLY_WAITING";
    if (run.ruleKey === "crm_follow_up_due") {
      const dueAt = member.nextFollowUpAt;
      if (!dueAt || CRM_CAMPAIGN_MEMBER_TERMINAL_STAGES.has(member.stage) || !isCrmFollowUpDue(dueAt, nowMs) || crmFollowUpOccurrenceKey(dueAt, nowMs, Number(config.repeatHours)) !== run.occurrenceKey) {
        await markSkipped(run, "crm_follow_up_no_longer_due");
        return "skipped";
      }
      eventType = "CRM_FOLLOW_UP_DUE";
    } else if (run.ruleKey === "crm_reply_waiting") {
      const lastInteractionAt = member.lastInteractionAt;
      const waitHours = Number(config.waitHours);
      if (!isCrmReplyWaiting(member.stage, lastInteractionAt, nowMs, waitHours) || crmReplyWaitingOccurrenceKey(lastInteractionAt!, nowMs, waitHours) !== run.occurrenceKey) {
        await markSkipped(run, "crm_reply_no_longer_waiting");
        return "skipped";
      }
      eventType = "CRM_REPLY_WAITING";
    } else {
      await markSkipped(run, "crm_rule_mismatch");
      return "skipped";
    }
    const eventId = `automation_${run.id}`;
    const eventRef = col("domainEvents").doc(eventId);
    try {
      await eventRef.create({
        organizationId: org(),
        eventType,
        resourceType: "crmCampaignMember",
        resourceId: member.id,
        workspaceId: member.workspaceId,
        payload: { userId: member.assignedToUserId, campaignMemberId: member.id, campaignId: campaign.id, contactId: contact.id, waitHours: run.ruleKey === "crm_reply_waiting" ? Number(config.waitHours) : null, automationRunId: run.id },
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

async function processCrmOccurrence(identity: AutomationRunIdentity, rule: RuleRow, summary: AutomationProcessSummary): Promise<void> {
  bump(summary, "scanned");
  const run = await claimAutomationRun(identity);
  if (!run) return;
  bump(summary, "claimed");
  const outcome = await executeCrmCampaignMemberRun(run, rule);
  bump(summary, outcome);
}

async function queryCrmCandidates(rule: RuleRow, limit: number): Promise<{ docs: QueryDocumentSnapshot[]; hasMore: boolean }> {
  const pageSize = Math.min(Math.max(limit, 1), MAX_SCAN);
  let query = col("crmCampaignMembers").where("organizationId", "==", org());
  let cursorId: string | undefined;
  if (rule.ruleKey === "crm_follow_up_due") {
    query = query.where("nextFollowUpAt", "<=", now()).orderBy("nextFollowUpAt", "asc");
    cursorId = rule.crmFollowUpCursorMemberId;
  } else if (rule.ruleKey === "crm_reply_waiting") {
    const waitHours = Number(rule.config.waitHours);
    query = query.where("stage", "==", "replied").where("lastInteractionAt", "<=", tsFromMs(Date.now() - waitHours * 60 * 60_000)).orderBy("lastInteractionAt", "asc");
    cursorId = rule.crmReplyWaitingCursorMemberId;
  } else {
    return { docs: [], hasMore: false };
  }
  if (cursorId) {
    const cursor = await col("crmCampaignMembers").doc(cursorId).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snap = await query.limit(pageSize + 1).get();
  return { docs: snap.docs.slice(0, pageSize), hasMore: snap.docs.length > pageSize };
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
  if (rule.ruleKey === "crm_follow_up_due" || rule.ruleKey === "crm_reply_waiting") {
    const page = await queryCrmCandidates(rule, limit);
    for (const doc of page.docs) {
      const member = fromDoc<CrmCampaignMember>(doc);
      if (!member.assignedToUserId || member.organizationId !== org()) continue;
      const occurrenceKey = rule.ruleKey === "crm_follow_up_due"
        ? (member.nextFollowUpAt ? crmFollowUpOccurrenceKey(member.nextFollowUpAt, Date.now(), Number(rule.config.repeatHours)) : "")
        : (member.lastInteractionAt ? crmReplyWaitingOccurrenceKey(member.lastInteractionAt, Date.now(), Number(rule.config.waitHours)) : "");
      if (!occurrenceKey) continue;
      await processCrmOccurrence({
        ruleId: rule.id,
        ruleKey: rule.ruleKey,
        targetType: "crmCampaignMember",
        targetId: member.id,
        recipientUserId: member.assignedToUserId,
        occurrenceKey,
        workspaceId: member.workspaceId,
      }, rule, summary);
    }
    const last = page.docs.at(-1);
    const cursorField = rule.ruleKey === "crm_follow_up_due" ? "crmFollowUpCursorMemberId" : "crmReplyWaitingCursorMemberId";
    await col("automationRules").doc(rule.id).update({ [cursorField]: page.hasMore && last ? last.id : FieldValue.delete() });
    return;
  }

  const page = await queryTaskCandidates(rule, limit);
  for (const doc of page.docs) {
    const task = fromDoc<Task>(doc);
    if (task.organizationId !== org() || !task.dueAt || !isAutomationTaskOpen(task)) continue;
    if (!task.accountableUserId) continue;
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
  const snap = await col("automationRuns")
    .where("organizationId", "==", org())
    .where("status", "==", "retry")
    .where("nextRetryAt", "<=", now())
    .orderBy("nextRetryAt", "asc")
    .limit(Math.min(Math.max(limit, 1), 100))
    .get();
  for (const doc of snap.docs) {
    const existing = fromDoc<AutomationRun>(doc);
    if (!isAutomationRuleKey(existing.ruleKey) || !isAutomationRuleExecutable(existing.ruleKey)) continue;
    const expectedTargetType = existing.ruleKey.startsWith("crm_") ? "crmCampaignMember" : "task";
    if (existing.targetType !== expectedTargetType) continue;
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
    const outcome = expectedTargetType === "task"
      ? await executeTaskRun(claimed, rule)
      : await executeCrmCampaignMemberRun(claimed, rule);
    bump(summary, outcome);
  }
}

export async function processScheduledAutomations(limit = 250): Promise<AutomationProcessSummary> {
  const summary: AutomationProcessSummary = { scanned: 0, claimed: 0, completed: 0, skipped: 0, retry: 0, failed: 0, unsupportedRules: 0 };
  await processDueRetries(Math.min(limit, 100), summary);
  const rulesSnap = await col("automationRules").where("organizationId", "==", org()).where("enabled", "==", true).get();
  const rules = rulesSnap.docs
    .map((doc) => fromDoc<AutomationRule & { ruleKey: string }>(doc))
    .filter((rule): rule is StoredAutomationRule => isAutomationRuleKey(rule.ruleKey));
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

import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { hasPermission, type Actor } from "@/domain/authz";
import type { AutomationRule, AutomationRun } from "@/domain/types";
import { automationRuleDocumentId } from "@/domain/automation";
import { writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { conflict, forbidden, notFound } from "../http";
import { AUTOMATION_RULES, isAutomationRuleExecutable, isAutomationRuleKey, validateAutomationRuleConfig } from "../automation/registry";

const org = () => serverEnv().ORGANIZATION_ID;

export async function listAutomationRules(actor: Actor) {
  if (!hasPermission(actor, "automation.rules.view")) throw forbidden();
  const snap = await col("automationRules").where("organizationId", "==", org()).get();
  const stored = new Map(snap.docs.map((doc) => [String(doc.data().ruleKey), fromDoc<AutomationRule>(doc)]));
  return Object.entries(AUTOMATION_RULES).map(([ruleKey, definition]) => {
    const existing = stored.get(ruleKey);
    return {
      id: existing?.id ?? automationRuleDocumentId(org(), ruleKey),
      organizationId: org(),
      ruleKey,
      label: definition.label,
      description: definition.description,
      triggerType: definition.triggerType,
      executionAvailable: definition.executionAvailable,
      unavailableReason: "unavailableReason" in definition ? definition.unavailableReason : undefined,
      enabled: definition.executionAvailable ? (existing?.enabled ?? false) : false,
      config: existing ? validateAutomationRuleConfig(ruleKey, existing.config) : definition.defaultConfig,
      schemaVersion: existing?.schemaVersion ?? 1,
      updatedAt: existing?.updatedAt,
      updatedBy: existing?.updatedBy,
    };
  });
}

export async function updateAutomationRule(
  actor: Actor,
  ruleKey: string,
  input: { enabled: boolean; config: Record<string, string | number | boolean | string[] | null> },
  requestId: string,
) {
  if (!hasPermission(actor, "automation.rules.manage")) throw forbidden();
  if (!isAutomationRuleKey(ruleKey)) throw notFound("Automation rule not found.");
  if (input.enabled && !isAutomationRuleExecutable(ruleKey)) {
    const definition = AUTOMATION_RULES[ruleKey];
    const unavailableReason = "unavailableReason" in definition && typeof definition.unavailableReason === "string"
      ? definition.unavailableReason
      : "This automation rule is not available yet.";
    throw conflict("automation_rule_unavailable", unavailableReason);
  }
  const config = validateAutomationRuleConfig(ruleKey, input.config);
  const ref = col("automationRules").doc(automationRuleDocumentId(org(), ruleKey));
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const before = snap.exists ? snap.data()! : undefined;
    tx.set(ref, {
      organizationId: org(),
      ruleKey,
      triggerType: AUTOMATION_RULES[ruleKey].triggerType,
      enabled: input.enabled,
      config,
      schemaVersion: 1,
      createdBy: before?.createdBy ?? actor.uid,
      updatedBy: actor.uid,
      createdAt: before?.createdAt ?? now(),
      updatedAt: now(),
    });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: input.enabled ? (before?.enabled ? "automation.rule_updated" : "automation.rule_enabled") : (before?.enabled ? "automation.rule_disabled" : "automation.rule_updated"),
      resourceType: "automationRule",
      resourceId: ref.id,
      after: { ruleKey, enabled: input.enabled, config },
      before: before ? { enabled: before.enabled, config: before.config } : undefined,
      requestId,
    });
  });
}


export async function listAutomationRuns(actor: Actor, limit = 50): Promise<AutomationRun[]> {
  if (!hasPermission(actor, "automation.runs.view_all")) throw forbidden();
  const snap = await col("automationRuns")
    .where("organizationId", "==", org())
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 100))
    .get();
  return snap.docs.map((doc) => fromDoc<AutomationRun>(doc));
}

export async function retryAutomationRun(actor: Actor, id: string, requestId: string): Promise<void> {
  if (!hasPermission(actor, "automation.runs.retry")) throw forbidden();
  const ref = col("automationRuns").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Automation run not found.");
    if (snap.data()?.status !== "failed") throw conflict("automation_run_not_failed", "Only failed automation runs can be retried.");
    const ruleKey = String(snap.data()?.ruleKey ?? "");
    if (!isAutomationRuleExecutable(ruleKey)) throw conflict("automation_rule_unavailable", "This automation rule is not currently executable.");
    const ruleRef = col("automationRules").doc(automationRuleDocumentId(org(), ruleKey));
    const ruleSnap = await tx.get(ruleRef);
    if (!ruleSnap.exists || ruleSnap.data()?.enabled !== true) {
      throw conflict("automation_rule_disabled", "Enable this automation rule before retrying its failed run.");
    }
    tx.update(ref, {
      status: "retry",
      attempts: 0,
      nextRetryAt: now(),
      leaseUntil: FieldValue.delete(),
      completedAt: FieldValue.delete(),
      lastErrorCode: FieldValue.delete(),
      updatedAt: now(),
    });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "automation.run_requeued",
      resourceType: "automationRun",
      resourceId: id,
      workspaceId: typeof snap.data()?.workspaceId === "string" ? String(snap.data()?.workspaceId) : undefined,
      before: { status: "failed" },
      after: { status: "retry", attempts: 0 },
      requestId,
    });
  });
}

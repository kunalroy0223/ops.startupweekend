import "server-only";
import { createHash } from "node:crypto";
import { hasPermission, type Actor } from "@/domain/authz";
import type { AutomationRule } from "@/domain/types";
import { writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { conflict, forbidden, notFound } from "../http";
import { AUTOMATION_RULES, isAutomationRuleKey, validateAutomationRuleConfig } from "../automation/registry";
import { assertActorInOrganization, assertActorProfile } from "./actor-access";

const org = () => serverEnv().ORGANIZATION_ID;
const ruleDocumentId = (organizationId: string, ruleKey: string) => createHash("sha256").update(`${organizationId}\u0000${ruleKey}`).digest("hex");

export async function listAutomationRules(actor: Actor) {
  await assertActorInOrganization(actor, org());
  if (!hasPermission(actor, "automation.rules.view")) throw forbidden();
  const snap = await col("automationRules").where("organizationId", "==", org()).get();
  const stored = new Map(snap.docs.map((doc) => [String(doc.data().ruleKey), fromDoc<AutomationRule>(doc)]));
  return Object.entries(AUTOMATION_RULES).map(([ruleKey, definition]) => {
    const existing = stored.get(ruleKey);
    return {
      id: existing?.id ?? ruleDocumentId(org(), ruleKey),
      organizationId: org(),
      ruleKey,
      label: definition.label,
      description: definition.description,
      triggerType: definition.triggerType,
      enabled: existing?.enabled ?? false,
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
  await assertActorInOrganization(actor, org());
  if (!hasPermission(actor, "automation.rules.manage")) throw forbidden();
  if (!isAutomationRuleKey(ruleKey)) throw notFound("Automation rule not found.");
  if (input.enabled) throw conflict("automation_engine_not_ready", "Automation rules cannot be enabled until the scheduled evaluator is deployed.");
  const config = validateAutomationRuleConfig(ruleKey, input.config);
  const ref = col("automationRules").doc(ruleDocumentId(org(), ruleKey));
  await adminDb().runTransaction(async (tx) => {
    const [snap, actorSnap] = await Promise.all([tx.get(ref), tx.get(col("users").doc(actor.uid))]);
    assertActorProfile(actor, org(), actorSnap.exists ? actorSnap.data() : undefined);
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

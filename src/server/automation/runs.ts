import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { AutomationRun, AutomationRunStatus } from "@/domain/types";
import { automationRunDocumentId, type AutomationRunIdentity } from "@/domain/automation";
import { col, fromDoc, now, tsFromMs } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";

const LEASE_MS = 60_000;
const MAX_AUTOMATION_ATTEMPTS = 5;
const FINAL_STATUSES: readonly AutomationRunStatus[] = ["completed", "skipped", "failed"];

/** Atomically claims one deterministic rule/target/recipient/occurrence execution. */
export async function claimAutomationRun(identity: AutomationRunIdentity): Promise<AutomationRun | null> {
  const organizationId = serverEnv().ORGANIZATION_ID;
  const id = automationRunDocumentId(identity, organizationId);
  const ref = col("automationRuns").doc(id);
  const currentTime = Date.now();
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const value = {
        organizationId,
        workspaceId: identity.workspaceId ?? null,
        ruleId: identity.ruleId,
        ruleKey: identity.ruleKey,
        targetType: identity.targetType,
        targetId: identity.targetId,
        recipientUserId: identity.recipientUserId,
        occurrenceKey: identity.occurrenceKey,
        idempotencyKey: id,
        status: "processing" as const,
        attempts: 1,
        leaseUntil: tsFromMs(currentTime + LEASE_MS),
        startedAt: now(),
        createdAt: now(),
        updatedAt: now(),
      };
      tx.create(ref, value);
      return { id, ...value, leaseUntil: new Date(currentTime + LEASE_MS).toISOString(), startedAt: new Date(currentTime).toISOString(), createdAt: new Date(currentTime).toISOString(), updatedAt: new Date(currentTime).toISOString() } as AutomationRun;
    }

    const existing = fromDoc<AutomationRun>(snap);
    if (FINAL_STATUSES.includes(existing.status)) return null;
    if (existing.status === "processing" && existing.leaseUntil && Date.parse(existing.leaseUntil) > currentTime) return null;
    if (existing.status === "retry" && existing.nextRetryAt && Date.parse(existing.nextRetryAt) > currentTime) return null;
    if (existing.attempts >= MAX_AUTOMATION_ATTEMPTS) {
      tx.update(ref, { status: "failed", lastErrorCode: "max_attempts_exceeded", leaseUntil: FieldValue.delete(), nextRetryAt: FieldValue.delete(), completedAt: now(), updatedAt: now() });
      return null;
    }

    tx.update(ref, {
      status: "processing",
      attempts: existing.attempts + 1,
      leaseUntil: tsFromMs(currentTime + LEASE_MS),
      startedAt: now(),
      updatedAt: now(),
      nextRetryAt: FieldValue.delete(),
      lastErrorCode: FieldValue.delete(),
    });
    return { ...existing, status: "processing", attempts: existing.attempts + 1, leaseUntil: new Date(currentTime + LEASE_MS).toISOString(), startedAt: new Date(currentTime).toISOString(), updatedAt: new Date(currentTime).toISOString(), nextRetryAt: undefined, lastErrorCode: undefined };
  });
}

export async function finishAutomationRun(
  id: string,
  expectedAttempt: number,
  result:
    | { status: "retry"; nextRetryAt: Date; errorCode?: string }
    | { status: "completed" | "skipped" | "failed"; domainEventId?: string; errorCode?: string },
): Promise<boolean> {
  const ref = col("automationRuns").doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.status !== "processing" || snap.data()?.attempts !== expectedAttempt) return false;
    const errorCode = result.errorCode && /^[a-z0-9_-]{1,64}$/.test(result.errorCode) ? result.errorCode : undefined;
    tx.update(ref, {
      status: result.status,
      ...("domainEventId" in result && result.domainEventId ? { domainEventId: result.domainEventId } : {}),
      ...(result.status === "retry" && result.nextRetryAt ? { nextRetryAt: tsFromMs(result.nextRetryAt.getTime()) } : { nextRetryAt: FieldValue.delete() }),
      ...(errorCode ? { lastErrorCode: errorCode } : { lastErrorCode: FieldValue.delete() }),
      ...(result.status === "completed" || result.status === "skipped" || result.status === "failed" ? { completedAt: now() } : {}),
      leaseUntil: FieldValue.delete(),
      updatedAt: now(),
    });
    return true;
  });
}

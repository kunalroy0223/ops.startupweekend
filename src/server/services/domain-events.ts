import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { hasPermission, type Actor } from "@/domain/authz";
import type { DomainEvent } from "@/domain/types";
import { writeAudit } from "../audit";
import { col, fromDoc } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { conflict, forbidden, notFound } from "../http";

const org = () => serverEnv().ORGANIZATION_ID;

export async function listFailedDomainEvents(actor: Actor, limit = 50): Promise<Array<Pick<DomainEvent, "id" | "eventType" | "resourceType" | "resourceId" | "status" | "attempts" | "lastErrorCode" | "createdAt" | "workspaceId">>> {
  if (!hasPermission(actor, "notifications.administer")) throw forbidden();
  const snap = await col("domainEvents")
    .where("organizationId", "==", org())
    .where("status", "==", "failed")
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 100))
    .get();
  return snap.docs.map((doc) => {
    const event = fromDoc<DomainEvent>(doc);
    return {
      id: event.id,
      eventType: event.eventType,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      status: event.status,
      attempts: event.attempts,
      lastErrorCode: event.lastErrorCode,
      createdAt: event.createdAt,
      workspaceId: event.workspaceId,
    };
  });
}

export async function retryFailedDomainEvent(actor: Actor, id: string, requestId: string): Promise<void> {
  if (!hasPermission(actor, "notifications.administer")) throw forbidden();
  const ref = col("domainEvents").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Notification event not found.");
    const data = snap.data()!;
    if (data.status !== "failed") throw conflict("event_not_failed", "Only failed notification events can be retried.");
    tx.update(ref, {
      status: "pending",
      attempts: 0,
      leaseUntil: FieldValue.delete(),
      processedAt: FieldValue.delete(),
      lastErrorCode: FieldValue.delete(),
    });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "notification.event_requeued",
      resourceType: "domainEvent",
      resourceId: id,
      workspaceId: typeof data.workspaceId === "string" ? data.workspaceId : undefined,
      before: { status: "failed", attempts: data.attempts ?? 0, lastErrorCode: data.lastErrorCode ?? null },
      after: { status: "pending", attempts: 0 },
      requestId,
    });
  });
}

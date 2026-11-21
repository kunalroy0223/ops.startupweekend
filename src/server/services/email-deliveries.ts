import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { hasPermission, type Actor } from "@/domain/authz";
import type { EmailDelivery } from "@/domain/types";
import { writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { conflict, forbidden, notFound } from "../http";

const org = () => serverEnv().ORGANIZATION_ID;

export async function listEmailDeliveries(actor: Actor, limit = 50): Promise<EmailDelivery[]> {
  if (!hasPermission(actor, "notifications.administer")) throw forbidden();
  const snap = await col("emailDeliveries")
    .where("organizationId", "==", org())
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 100))
    .get();
  return snap.docs.map((doc) => fromDoc<EmailDelivery>(doc));
}

export async function retryEmailDelivery(actor: Actor, id: string, requestId: string): Promise<void> {
  if (!hasPermission(actor, "notifications.administer")) throw forbidden();
  const ref = col("emailDeliveries").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Email delivery not found.");
    const data = snap.data()!;
    if (data.status !== "failed") throw conflict("email_delivery_not_failed", "Only failed email deliveries can be retried.");
    if (data.lastErrorCode === "recipient_no_longer_eligible") {
      throw conflict("email_recipient_ineligible", "This recipient is no longer eligible for the notification.");
    }

    const requeues = Number(data.requeues ?? 0) + 1;
    const lastErrorCode = String(data.lastErrorCode ?? "");
    const ambiguous = lastErrorCode === "network_error" || lastErrorCode === "missing_message_id";
    tx.update(ref, {
      status: "pending",
      attempts: 0,
      requeues,
      idempotencyKey: ambiguous ? data.idempotencyKey : `${id}-r${requeues}`,
      nextRetryAt: now(),
      leaseUntil: FieldValue.delete(),
      lastErrorCode: FieldValue.delete(),
      updatedAt: now(),
    });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "notification.email_requeued",
      resourceType: "emailDelivery",
      resourceId: id,
      before: { status: "failed", lastErrorCode: data.lastErrorCode ?? null },
      after: { status: "pending", attempts: 0, requeues },
      requestId,
    });
  });
}

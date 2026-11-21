import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { hasPermission, type Actor } from "@/domain/authz";
import type { NotificationDigest } from "@/domain/types";
import { writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { conflict, forbidden, notFound } from "../http";

const org = () => serverEnv().ORGANIZATION_ID;

export async function listNotificationDigests(actor: Actor, limit = 50): Promise<NotificationDigest[]> {
  if (!hasPermission(actor, "notifications.administer")) throw forbidden();
  const snap = await col("notificationDigests")
    .where("organizationId", "==", org())
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 100))
    .get();
  return snap.docs.map((doc) => fromDoc<NotificationDigest>(doc));
}

export async function retryNotificationDigest(actor: Actor, id: string, requestId: string): Promise<void> {
  if (!hasPermission(actor, "notifications.administer")) throw forbidden();
  const ref = col("notificationDigests").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Notification digest not found.");
    if (snap.data()?.status !== "failed") throw conflict("digest_not_failed", "Only failed daily digests can be retried.");
    tx.update(ref, {
      status: "queued",
      attempts: 0,
      nextRetryAt: now(),
      leaseUntil: FieldValue.delete(),
      lastErrorCode: FieldValue.delete(),
      updatedAt: now(),
    });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "notification.digest_requeued",
      resourceType: "notificationDigest",
      resourceId: id,
      before: { status: "failed" },
      after: { status: "queued", attempts: 0 },
      requestId,
    });
  });
}

import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { NotificationDigest, NotificationDigestItem, NotificationPreferences, UserProfile } from "@/domain/types";
import { dailyDigestScheduledAt, localDateParts, notificationDigestDocumentId } from "@/domain/notifications";
import { isRetryableStatus, nextRetryDelayMs } from "@/domain/events";
import { col, fromDoc, now, tsFromMs } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { renderNotice } from "../email/render";
import { sendWithResend } from "../email/resend";

const MAX_DIGEST_ATTEMPTS = 5;
const DIGEST_LEASE_MS = 60_000;
const MAX_ITEMS_PER_TRANSACTION = 400;

type DigestRecord = NotificationDigest & {
  itemIds: string[];
  attempts: number;
  leaseUntil?: string;
  nextRetryAt?: string;
  lastErrorCode?: string;
  providerMessageId?: string;
  sentAt?: string;
};

export interface DigestProcessSummary {
  queued: number;
  sent: number;
  skipped: number;
  retry: number;
  failed: number;
}

function previousLocalDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const previous = new Date(Date.UTC(year!, month! - 1, day! - 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-${String(previous.getUTCDate()).padStart(2, "0")}`;
}

async function organizationTimeZone(): Promise<string> {
  const organizationId = serverEnv().ORGANIZATION_ID;
  const snap = await col("organizations").doc(organizationId).get();
  const timezone = String(snap.data()?.timezone ?? "Asia/Kolkata");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    return "Asia/Kolkata";
  }
}

/**
 * Atomically creates or extends today's queued digest and marks the selected
 * items as batched. This makes retries safe if a worker exits mid-batch.
 */
async function attachItemsToDigest(
  digestId: string,
  digestBase: Omit<NotificationDigest, "id" | "itemCount" | "itemIds" | "status" | "attempts" | "createdAt" | "updatedAt">,
  items: NotificationDigestItem[],
): Promise<number> {
  let attached = 0;
  for (let offset = 0; offset < items.length; offset += MAX_ITEMS_PER_TRANSACTION) {
    const slice = items.slice(offset, offset + MAX_ITEMS_PER_TRANSACTION);
    const digestRef = col("notificationDigests").doc(digestId);
    const itemRefs = slice.map((item) => col("notificationDigestItems").doc(item.id));

    const count = await adminDb().runTransaction(async (tx) => {
      const digestSnap = await tx.get(digestRef);
      const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));
      const pending = itemSnaps
        .map((snap, index) => ({ snap, item: slice[index]! }))
        .filter(({ snap }) => snap.exists && snap.data()?.status === "pending");
      if (!pending.length) return 0;
      if (digestSnap.exists && digestSnap.data()?.status !== "queued") return 0;

      const existingIds = digestSnap.exists && Array.isArray(digestSnap.data()?.itemIds)
        ? digestSnap.data()!.itemIds as string[]
        : [];
      const available = Math.max(0, MAX_ITEMS_PER_TRANSACTION - existingIds.length);
      const selected = pending.slice(0, available);
      if (!selected.length) return 0;
      const pendingIds = selected.map(({ item }) => item.id);
      if (!digestSnap.exists) {
        tx.create(digestRef, {
          ...digestBase,
          itemCount: pendingIds.length,
          itemIds: pendingIds,
          status: "queued",
          attempts: 0,
          nextRetryAt: now(),
          createdAt: now(),
          updatedAt: now(),
        });
      } else {
        tx.update(digestRef, {
          itemIds: FieldValue.arrayUnion(...pendingIds),
          itemCount: FieldValue.increment(pendingIds.length),
          updatedAt: now(),
        });
      }

      for (const { snap } of selected) {
        tx.update(snap.ref, {
          status: "batched",
          digestId,
          includedAt: now(),
        });
      }
      return pendingIds.length;
    });
    attached += count;
  }
  return attached;
}

async function queuePendingDigestItems(limit: number, timezone: string): Promise<number> {
  const organizationId = serverEnv().ORGANIZATION_ID;
  const cutoff = new Date();
  const local = localDateParts(cutoff, timezone);
  const scheduledAt = dailyDigestScheduledAt(local.date, timezone);
  if (cutoff.getTime() < Date.parse(scheduledAt)) return 0;

  const pending = await col("notificationDigestItems")
    .where("organizationId", "==", organizationId)
    .where("status", "==", "pending")
    .where("createdAt", "<=", tsFromMs(cutoff.getTime()))
    .orderBy("createdAt", "asc")
    .limit(Math.min(Math.max(limit, 1), MAX_ITEMS_PER_TRANSACTION))
    .get();

  const groups = new Map<string, NotificationDigestItem[]>();
  for (const doc of pending.docs) {
    const item = fromDoc<NotificationDigestItem>(doc);
    if (!item.recipientUserId) continue;
    const group = groups.get(item.recipientUserId) ?? [];
    group.push(item);
    groups.set(item.recipientUserId, group);
  }

  const previousAt = dailyDigestScheduledAt(previousLocalDate(local.date), timezone);
  let attached = 0;
  for (const [recipientUserId, items] of groups) {
    const digestId = notificationDigestDocumentId(organizationId, recipientUserId, local.date);
    const digestBase = {
      organizationId,
      recipientUserId,
      digestDate: local.date,
      timezone,
      periodStart: previousAt,
      periodEnd: cutoff.toISOString(),
      eventId: `daily-digest-${local.date}-${digestId.slice(0, 12)}`,
    };
    attached += await attachItemsToDigest(digestId, digestBase, items);
  }
  return attached;
}

async function claimDigest(id: string): Promise<DigestRecord | null> {
  const ref = col("notificationDigests").doc(id);
  const currentTime = Date.now();
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const digest = fromDoc<DigestRecord>(snap);
    if (digest.status !== "queued" && digest.status !== "processing") return null;
    if (digest.status === "processing" && digest.leaseUntil && Date.parse(digest.leaseUntil) > currentTime) return null;
    if (digest.status === "queued" && digest.nextRetryAt && Date.parse(digest.nextRetryAt) > currentTime) return null;
    if ((digest.attempts ?? 0) >= MAX_DIGEST_ATTEMPTS) {
      tx.update(ref, { status: "failed", lastErrorCode: "max_attempts_exceeded", leaseUntil: FieldValue.delete(), updatedAt: now() });
      return null;
    }
    tx.update(ref, {
      status: "processing",
      attempts: (digest.attempts ?? 0) + 1,
      leaseUntil: tsFromMs(currentTime + DIGEST_LEASE_MS),
      updatedAt: now(),
      lastErrorCode: FieldValue.delete(),
    });
    return { ...digest, attempts: (digest.attempts ?? 0) + 1, leaseUntil: new Date(currentTime + DIGEST_LEASE_MS).toISOString() };
  });
}

async function finishDigestWithItems(
  id: string,
  expectedAttempt: number,
  itemIds: string[],
  status: "sent" | "skipped",
  fields: Record<string, unknown>,
  itemStatus: "sent" | "skipped",
): Promise<void> {
  const digestRef = col("notificationDigests").doc(id);
  const itemRefs = itemIds.map((itemId) => col("notificationDigestItems").doc(itemId));
  await adminDb().runTransaction(async (tx) => {
    const digestSnap = await tx.get(digestRef);
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));
    if (!digestSnap.exists || digestSnap.data()?.status !== "processing" || digestSnap.data()?.attempts !== expectedAttempt) return;
    for (const snap of itemSnaps) {
      if (snap.exists && snap.data()?.status === "batched" && snap.data()?.digestId === id) {
        tx.update(snap.ref, { status: itemStatus });
      }
    }
    tx.update(digestRef, { ...fields, status, leaseUntil: FieldValue.delete(), updatedAt: now() });
  });
}

async function sendDigest(id: string): Promise<"sent" | "skipped" | "retry" | "failed"> {
  const digest = await claimDigest(id);
  if (!digest) return "skipped";
  const ref = col("notificationDigests").doc(id);
  const finish = async (fields: Record<string, unknown>) => adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.status !== "processing" || snap.data()?.attempts !== digest.attempts) return false;
    tx.update(ref, { ...fields, leaseUntil: FieldValue.delete(), updatedAt: now() });
    return true;
  });
  const itemIds = Array.isArray(digest.itemIds) ? digest.itemIds : [];

  try {
    const [userSnap, preferencesSnap] = await Promise.all([
      col("users").doc(digest.recipientUserId).get(),
      col("notificationPreferences").doc(digest.recipientUserId).get(),
    ]);
    const user = userSnap.exists ? fromDoc<UserProfile>(userSnap, "uid") : null;
    const preferences = preferencesSnap.exists
      ? { emailEnabled: true, deliveryMode: "immediate", ...(preferencesSnap.data() as Partial<NotificationPreferences>) }
      : { emailEnabled: true, deliveryMode: "immediate" };

    if (!user || user.organizationId !== serverEnv().ORGANIZATION_ID || user.status !== "active" || !preferences.emailEnabled || preferences.deliveryMode !== "daily_digest") {
      await finishDigestWithItems(id, digest.attempts, itemIds, "skipped", { lastErrorCode: "recipient_no_longer_eligible", sentAt: now(), nextRetryAt: FieldValue.delete() }, "skipped");
      return "skipped";
    }

    const refs = itemIds.map((itemId) => col("notificationDigestItems").doc(itemId));
    const snapshots = refs.length ? await adminDb().getAll(...refs) : [];
    const items = snapshots
      .filter((snap) => snap.exists)
      .map((snap) => fromDoc<NotificationDigestItem>(snap))
      .filter((item) => item.status === "batched" && item.digestId === id);
    if (!items.length) {
      await finishDigestWithItems(id, digest.attempts, itemIds, "skipped", { itemCount: 0, sentAt: now(), nextRetryAt: FieldValue.delete() }, "skipped");
      return "skipped";
    }

    const paragraphs = items.slice(0, 40).map((item) => `${item.title}: ${item.body}`);
    if (items.length > paragraphs.length) paragraphs.push(`${items.length - paragraphs.length} additional notifications are available in your inbox.`);
    const content = {
      templateId: "daily_notification_digest",
      subject: `Your Inhub Workspace daily digest · ${digest.digestDate}`,
      preview: `${items.length} notification${items.length === 1 ? "" : "s"} from your workspace.`,
      eyebrow: "Daily digest",
      heading: "Your workspace updates.",
      paragraphs,
      cta: { label: "Open notifications", href: new URL("/notifications", serverEnv().APP_URL).toString() },
    };
    const rendered = await renderNotice(content);
    const result = await sendWithResend({
      to: user.email,
      subject: content.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `daily-digest-${id}`,
      tags: [{ name: "event", value: "daily_digest" }],
    });

    if (result.ok) {
      await finishDigestWithItems(id, digest.attempts, items.map((item) => item.id), "sent", { sentAt: now(), providerMessageId: result.providerMessageId, nextRetryAt: FieldValue.delete(), lastErrorCode: FieldValue.delete() }, "sent");
      return "sent";
    }

    const retryable = result.code !== "provider_not_configured" && isRetryableStatus(result.httpStatus);
    const delay = retryable ? nextRetryDelayMs(digest.attempts) : null;
    if (delay === null) {
      await finish({ status: "failed", lastErrorCode: result.code, nextRetryAt: FieldValue.delete() });
      return "failed";
    }
    await finish({ status: "queued", lastErrorCode: result.code, nextRetryAt: tsFromMs(Date.now() + delay) });
    return "retry";
  } catch (error) {
    const code = error instanceof Error ? error.message.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 64) : "digest_error";
    const delay = nextRetryDelayMs(digest.attempts);
    if (delay === null) {
      await finish({ status: "failed", lastErrorCode: code, nextRetryAt: FieldValue.delete() });
      return "failed";
    }
    await finish({ status: "queued", lastErrorCode: code, nextRetryAt: tsFromMs(Date.now() + delay) });
    return "retry";
  }
}

export async function processDailyDigests(limit = 100): Promise<DigestProcessSummary> {
  const summary: DigestProcessSummary = { queued: 0, sent: 0, skipped: 0, retry: 0, failed: 0 };
  const timezone = await organizationTimeZone();
  const nowDate = new Date();
  if (localDateParts(nowDate, timezone).hour >= 9) {
    summary.queued = await queuePendingDigestItems(limit, timezone);
  }

  const organizationId = serverEnv().ORGANIZATION_ID;
  const pageSize = Math.min(Math.max(limit, 1), 200);
  const [due, stale] = await Promise.all([
    col("notificationDigests")
      .where("organizationId", "==", organizationId)
      .where("status", "==", "queued")
      .where("nextRetryAt", "<=", now())
      .orderBy("nextRetryAt", "asc")
      .limit(pageSize)
      .get(),
    col("notificationDigests")
      .where("organizationId", "==", organizationId)
      .where("status", "==", "processing")
      .where("leaseUntil", "<=", now())
      .orderBy("leaseUntil", "asc")
      .limit(pageSize)
      .get(),
  ]);
  const ids = new Set([...due.docs, ...stale.docs].map((doc) => doc.id));
  for (const id of ids) {
    const outcome = await sendDigest(id);
    summary[outcome]++;
  }
  return summary;
}

import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_PREFERENCES, EVENT_CATALOGUE, isEventType, isRetryableStatus, nextRetryDelayMs, resolveChannels, type ChannelPreferenceInput } from "@/domain/events";
import type { DomainEvent, EmailDelivery, UserProfile } from "@/domain/types";
import { col, fromDoc, now, tsFromMs } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { renderNotice } from "../email/render";
import { sendWithResend, type SendResult } from "../email/resend";
import { handlerFor, type Recipient } from "./registry";
import { notificationDigestItemDocumentId } from "@/domain/notifications";

/**
 * Durable outbox processor (at-least-once, idempotent).
 *
 * 1. Claim a pending event with a short lease (transaction).
 * 2. Fan out: one in-app notification and one email delivery per recipient,
 *    created with deterministic IDs via create(), so re-processing is a no-op.
 * 3. Send due email deliveries, each claimed by lease, using a stable
 *    Idempotency-Key. Email failures never touch the business change.
 *
 * Triggered after each mutation (next/server `after`) and by the cron route.
 */

const LEASE_MS = 60_000;
const MAX_EVENT_ATTEMPTS = 5;
const ALREADY_EXISTS = 6;

const isAlreadyExists = (err: unknown) => (err as { code?: number })?.code === ALREADY_EXISTS;
const recipientHash = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 16);

export const notificationId = (eventId: string, recipientKey: string) => `${eventId}_${recipientHash(recipientKey)}`;
export const deliveryId = (eventId: string, recipientKey: string) => `${eventId}_${recipientHash(recipientKey)}_email`;

async function claimEvent(id: string): Promise<DomainEvent | null> {
  const ref = col("domainEvents").doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const ev = fromDoc<DomainEvent>(snap);
    if (ev.status === "processed" || ev.status === "failed") return null;
    if (ev.status === "processing" && ev.leaseUntil && Date.parse(ev.leaseUntil) > Date.now()) return null;
    tx.update(ref, { status: "processing", leaseUntil: tsFromMs(Date.now() + LEASE_MS), attempts: FieldValue.increment(1) });
    return { ...ev, attempts: ev.attempts + 1 };
  });
}

async function preferencesFor(uid: string | undefined): Promise<ChannelPreferenceInput> {
  if (!uid) return DEFAULT_PREFERENCES;
  const snap = await col("notificationPreferences").doc(uid).get();
  return snap.exists ? { ...DEFAULT_PREFERENCES, ...(snap.data() as Partial<ChannelPreferenceInput>) } : DEFAULT_PREFERENCES;
}

async function eligible(recipient: Recipient): Promise<boolean> {
  if (!recipient.uid) return true; // invitee: validated by the handler against the invitation
  const snap = await col("users").doc(recipient.uid).get();
  if (!snap.exists) return false;
  const user = fromDoc<UserProfile>(snap, "uid");
  if (user.organizationId !== serverEnv().ORGANIZATION_ID) return false;
  return user.status === "active" || !!recipient.allowInactive;
}

async function fanOut(event: DomainEvent): Promise<void> {
  if (!isEventType(event.eventType)) throw new Error("unknown_event_type");
  const handler = handlerFor(event.eventType);
  if (!handler) throw new Error("no_handler");
  const recipients = await handler.resolve(event);
  const org = serverEnv().ORGANIZATION_ID;

  for (const r of recipients) {
    if (!(await eligible(r))) continue;
    const prefs = await preferencesFor(r.uid);
    const channels = resolveChannels(event.eventType, prefs);
    const inApp = channels.inApp && r.only?.inApp !== false && !!r.uid;
    const email = r.only?.email === false ? "none" : channels.email;

    if (inApp) {
      try {
        await col("notifications").doc(notificationId(event.id, r.key)).create({
          organizationId: org,
          recipientUserId: r.uid,
          eventId: event.id,
          eventType: event.eventType,
          title: r.inApp.title,
          body: r.inApp.body,
          actionUrl: r.inApp.actionUrl,
          resourceType: r.inApp.resourceType,
          resourceId: r.inApp.resourceId,
          readAt: null,
          digestPending: email === "digest",
          createdAt: now(),
        });
      } catch (err) {
        if (!isAlreadyExists(err)) throw err;
      }
    }

    if (email === "digest") {
      const digestItemId = notificationDigestItemDocumentId(event.id, r.key);
      try {
        await col("notificationDigestItems").doc(digestItemId).create({
          organizationId: org,
          recipientUserId: r.uid,
          eventId: event.id,
          eventType: event.eventType,
          title: r.inApp.title,
          body: r.inApp.body,
          resourceType: r.inApp.resourceType,
          resourceId: r.inApp.resourceId,
          actionUrl: r.inApp.actionUrl,
          status: "pending",
          createdAt: now(),
        });
      } catch (err) {
        if (!isAlreadyExists(err)) throw err;
      }
    }

    if (email === "immediate") {
      const id = deliveryId(event.id, r.key);
      try {
        await col("emailDeliveries").doc(id).create({
          organizationId: org,
          eventId: event.id,
          eventType: event.eventType,
          recipientKey: r.key,
          recipientUserId: r.uid,
          recipientEmail: r.email,
          templateId: "pending_render",
          provider: "resend",
          status: "pending",
          idempotencyKey: id,
          attempts: 0,
          nextRetryAt: now(),
          createdAt: now(),
          updatedAt: now(),
        });
      } catch (err) {
        if (!isAlreadyExists(err)) throw err;
      }
    }
  }
}

export async function processEvent(id: string): Promise<"processed" | "skipped" | "retry" | "failed"> {
  const event = await claimEvent(id);
  if (!event) return "skipped";
  const ref = col("domainEvents").doc(id);
  try {
    await fanOut(event);
    await ref.update({ status: "processed", processedAt: now(), leaseUntil: FieldValue.delete(), lastErrorCode: FieldValue.delete() });
    return "processed";
  } catch (err) {
    const code = (err instanceof Error ? err.message : "error").slice(0, 64);
    const final = event.attempts >= MAX_EVENT_ATTEMPTS;
    await ref.update({ status: final ? "failed" : "pending", lastErrorCode: code, leaseUntil: FieldValue.delete() });
    console.error(`[outbox] event ${id} ${final ? "failed" : "will retry"}: ${code}`);
    return final ? "failed" : "retry";
  }
}

async function claimDelivery(id: string): Promise<(EmailDelivery & { eventType: string; recipientKey: string }) | null> {
  const ref = col("emailDeliveries").doc(id);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = fromDoc<EmailDelivery & { eventType: string; recipientKey: string; leaseUntil?: string }>(snap);
    if (d.status !== "pending") return null;
    if (d.leaseUntil && Date.parse(d.leaseUntil) > Date.now()) return null;
    if (d.nextRetryAt && Date.parse(d.nextRetryAt) > Date.now()) return null;
    tx.update(ref, { leaseUntil: tsFromMs(Date.now() + LEASE_MS), attempts: FieldValue.increment(1), lastAttemptAt: now() });
    return { ...d, attempts: d.attempts + 1 };
  });
}

export async function sendDelivery(id: string, send: (e: Parameters<typeof sendWithResend>[0]) => Promise<SendResult> = sendWithResend): Promise<string> {
  const d = await claimDelivery(id);
  if (!d) return "skipped";
  const ref = col("emailDeliveries").doc(id);
  const finish = (fields: Record<string, unknown>) => ref.update({ ...fields, leaseUntil: FieldValue.delete(), updatedAt: now() });

  // Re-resolve at send time so eligibility and content reflect current state.
  const evSnap = await col("domainEvents").doc(d.eventId).get();
  const handler = handlerFor(d.eventType);
  if (!evSnap.exists || !handler) {
    await finish({ status: "failed", lastErrorCode: "event_missing" });
    return "failed";
  }
  const recipients = await handler.resolve(fromDoc<DomainEvent>(evSnap));
  const recipient = recipients.find((r) => r.key === d.recipientKey);
  if (!recipient || !(await eligible(recipient))) {
    await finish({ status: "failed", lastErrorCode: "recipient_no_longer_eligible", nextRetryAt: FieldValue.delete() });
    return "failed";
  }

  let content: Awaited<ReturnType<Recipient["compose"]>>;
  let rendered: { html: string; text: string };
  try {
    content = await recipient.compose();
    rendered = await renderNotice(content);
  } catch (err) {
    console.error(`[email] render failed for ${id}`, err);
    await finish({ status: "failed", lastErrorCode: "render_failed", nextRetryAt: FieldValue.delete() });
    return "failed";
  }

  const result = await send({
    to: recipient.email,
    subject: content.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: d.idempotencyKey,
    tags: [{ name: "event", value: d.eventType.toLowerCase() }],
  });

  if (result.ok) {
    await finish({ status: "sent", templateId: content.templateId, providerMessageId: result.providerMessageId, nextRetryAt: FieldValue.delete(), lastErrorCode: FieldValue.delete() });
    return "sent";
  }
  const retryable = result.code !== "provider_not_configured" && isRetryableStatus(result.httpStatus);
  const delay = retryable ? nextRetryDelayMs(d.attempts) : null;
  await finish({
    status: delay === null ? "failed" : "pending",
    templateId: content.templateId,
    lastErrorCode: result.code,
    nextRetryAt: delay === null ? FieldValue.delete() : tsFromMs(Date.now() + delay),
  });
  return delay === null ? "failed" : "retry";
}

export interface ProcessSummary {
  events: Record<string, number>;
  emails: Record<string, number>;
}

export async function processOutbox(limit = 25): Promise<ProcessSummary> {
  const summary: ProcessSummary = { events: {}, emails: {} };
  const bump = (bucket: Record<string, number>, k: string) => (bucket[k] = (bucket[k] ?? 0) + 1);

  const [pending, stale] = await Promise.all([
    col("domainEvents").where("status", "==", "pending").orderBy("createdAt").limit(limit).get(),
    col("domainEvents").where("status", "==", "processing").where("leaseUntil", "<", now()).limit(limit).get(),
  ]);
  for (const doc of [...pending.docs, ...stale.docs]) bump(summary.events, await processEvent(doc.id));

  const due = await col("emailDeliveries").where("status", "==", "pending").where("nextRetryAt", "<=", now()).orderBy("nextRetryAt").limit(limit).get();
  for (const doc of due.docs) bump(summary.emails, await sendDelivery(doc.id));
  return summary;
}

/** Admin action: put failed deliveries back in the queue (e.g. after Resend is configured). */
export async function requeueFailedDeliveries(limit = 100): Promise<number> {
  const snap = await col("emailDeliveries").where("status", "==", "failed").limit(limit).get();
  const batch = adminDb().batch();
  let n = 0;
  for (const doc of snap.docs) {
    if (doc.data().lastErrorCode === "recipient_no_longer_eligible") continue;
    // A definite provider rejection was never sent, so a fresh key cannot duplicate an email. For
    // ambiguous failures (timeouts) keep the old key so Resend can still deduplicate within 24h.
    const code = String(doc.data().lastErrorCode ?? "");
    const ambiguous = code === "network_error" || code === "missing_message_id";
    const requeues = Number(doc.data().requeues ?? 0) + 1;
    batch.update(doc.ref, {
      status: "pending",
      attempts: 0,
      requeues,
      idempotencyKey: ambiguous ? doc.data().idempotencyKey : `${doc.id}-r${requeues}`,
      nextRetryAt: now(),
      updatedAt: now(),
    });
    n++;
  }
  if (n) await batch.commit();
  return n;
}

export { EVENT_CATALOGUE };

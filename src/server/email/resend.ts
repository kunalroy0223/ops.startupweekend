import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "../env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  tags?: { name: string; value: string }[];
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; httpStatus?: number; code: string };

/**
 * Minimal Resend client over HTTPS. Uses Resend's Idempotency-Key header so a
 * retried send inside Resend's 24h window can never produce a second email;
 * the delivery record's deterministic ID guards beyond that window.
 */
export async function sendWithResend(email: OutgoingEmail, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) return { ok: false, code: "provider_not_configured" };
  let res: Response;
  try {
    res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        reply_to: env.EMAIL_REPLY_TO,
        tags: email.tags,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, code: "network_error" };
  }
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return body.id ? { ok: true, providerMessageId: body.id } : { ok: false, httpStatus: res.status, code: "missing_message_id" };
  }
  const body = (await res.json().catch(() => ({}))) as { name?: string };
  return { ok: false, httpStatus: res.status, code: (body.name ?? `http_${res.status}`).slice(0, 64) };
}

/**
 * Verifies a Resend (Svix) webhook signature: HMAC-SHA256 over
 * "{svix-id}.{svix-timestamp}.{raw body}" keyed with the base64 part of the
 * whsec_ secret. Rejects timestamps older than 5 minutes (replay window).
 */
export function verifyWebhookSignature(
  input: { id: string | null; timestamp: string | null; signature: string | null; body: string },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature, body } = input;
  if (!id || !timestamp || !signature || !secret.startsWith("whsec_")) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { col, now } from "@/server/db";
import { serverEnv } from "@/server/env";
import { verifyWebhookSignature } from "@/server/email/resend";

const STATUS_BY_TYPE: Record<string, "delivered" | "bounced" | "failed" | undefined> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.failed": "failed",
};

const ORDER = { pending: 0, sent: 1, failed: 2, delivered: 2, bounced: 3 } as const;

/** Resend delivery webhooks. Signature-verified and deduplicated by svix-id. */
export async function POST(req: NextRequest) {
  const secret = serverEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "not_configured" } }, { status: 503 });
  const body = await req.text();
  const id = req.headers.get("svix-id");
  const valid = verifyWebhookSignature({ id, timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"), body }, secret);
  if (!valid) return NextResponse.json({ error: { code: "invalid_signature" } }, { status: 401 });

  try {
    await col("webhookReceipts").doc(`resend_${id}`).create({ at: now() });
  } catch {
    return NextResponse.json({ data: { duplicate: true } }); // already processed
  }

  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
  const next = event.type ? STATUS_BY_TYPE[event.type] : undefined;
  const messageId = event.data?.email_id;
  if (next && messageId) {
    const snap = await col("emailDeliveries").where("providerMessageId", "==", messageId).limit(1).get();
    const doc = snap.docs[0];
    const current = doc?.data().status as keyof typeof ORDER | undefined;
    // Never move a delivery backwards (webhooks can arrive out of order).
    if (doc && current && ORDER[next] >= ORDER[current]) {
      await doc.ref.update({ status: next, updatedAt: now(), ...(next !== "delivered" ? { lastErrorCode: event.type } : {}) });
    }
  }
  return NextResponse.json({ data: { ok: true } });
}

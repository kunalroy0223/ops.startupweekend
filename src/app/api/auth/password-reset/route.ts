import { createHash } from "node:crypto";
import { passwordResetRequestSchema } from "@/domain/validation";
import { col, now, tsFromMs } from "@/server/db";
import { appUrl, emailConfigured, serverEnv } from "@/server/env";
import { renderNotice } from "@/server/email/render";
import { sendWithResend } from "@/server/email/resend";
import { adminAuth } from "@/server/firebase-admin";
import { assertSameOrigin, ok, parseBody, route } from "@/server/http";

const THROTTLE_MS = 60_000;

/**
 * Password reset. With Resend configured the branded email is sent from the
 * server with a Firebase-generated reset code. Without it, the client falls
 * back to Firebase's built-in reset email. The response is identical whether
 * or not the address exists, so accounts cannot be enumerated.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { email } = await parseBody(req, passwordResetRequestSchema);
  if (!emailConfigured()) return ok({ mode: "firebase" });

  const key = createHash("sha256").update(email).digest("hex");
  const throttleRef = col("rateLimits").doc(`pwreset_${key}`);
  const last = await throttleRef.get();
  if (last.exists && Date.now() - last.data()!.at.toMillis() < THROTTLE_MS) return ok({ mode: "server" });
  await throttleRef.set({ at: now(), expiresAt: tsFromMs(Date.now() + 86_400_000) });

  const users = await col("users").where("emailNormalized", "==", email).where("organizationId", "==", serverEnv().ORGANIZATION_ID).limit(1).get();
  const user = users.docs[0];
  if (!user || user.data().status !== "active") return ok({ mode: "server" });

  try {
    const firebaseLink = await adminAuth().generatePasswordResetLink(email);
    const oobCode = new URL(firebaseLink).searchParams.get("oobCode");
    if (!oobCode) throw new Error("no_oob_code");
    const resetUrl = appUrl(`/reset-password?oobCode=${encodeURIComponent(oobCode)}`);
    const { html, text } = await renderNotice({
      preview: "Reset your Inhub Workspace password.",
      eyebrow: "Security",
      heading: "Reset your password.",
      paragraphs: ["Someone asked to reset the password for this Inhub Workspace account. If it was you, use the button below. The link expires in one hour.", "If you didn't ask for this, you can ignore this email. Your password won't change."],
      cta: { label: "Choose a new password", href: resetUrl },
    });
    const delivery = col("emailDeliveries").doc();
    const result = await sendWithResend({ to: email, subject: "Reset your Inhub Workspace password", html, text, idempotencyKey: delivery.id, tags: [{ name: "event", value: "password_reset" }] });
    // Metadata only: the reset link is never stored.
    await delivery.set({
      organizationId: serverEnv().ORGANIZATION_ID,
      eventId: "password_reset",
      eventType: "PASSWORD_RESET_REQUESTED",
      recipientUserId: user.id,
      recipientEmail: email,
      templateId: "password_reset",
      provider: "resend",
      status: result.ok ? "sent" : "failed",
      providerMessageId: result.ok ? result.providerMessageId : null,
      lastErrorCode: result.ok ? null : result.code,
      idempotencyKey: delivery.id,
      attempts: 1,
      createdAt: now(),
      updatedAt: now(),
    });
  } catch (err) {
    console.error("[password-reset] failed", err);
  }
  return ok({ mode: "server" });
});

import { NextResponse } from "next/server";
import { ConfigurationError, emailConfigured, serverEnv } from "@/server/env";

export const dynamic = "force-dynamic";

/** Configuration health without revealing any values. */
export async function GET() {
  try {
    const env = serverEnv();
    return NextResponse.json({ ok: true, emulators: env.USE_FIREBASE_EMULATORS, email: emailConfigured(env) ? "configured" : "not_configured", webhooks: env.RESEND_WEBHOOK_SECRET ? "configured" : "not_configured" });
  } catch (err) {
    if (err instanceof ConfigurationError) return NextResponse.json({ ok: false, missing: err.issues.map((i) => i.split(":")[0]) }, { status: 503 });
    throw err;
  }
}

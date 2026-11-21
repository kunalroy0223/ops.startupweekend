import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { processScheduledAutomations } from "@/server/automation/evaluator";
import { processDailyDigests } from "@/server/notifications/digests";
import { processOutbox } from "@/server/notifications/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily backstop for notification outbox, scheduled reminders and local-time digests. */
export async function GET(req: NextRequest) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${serverEnv().CRON_SECRET}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }
  const automation = await processScheduledAutomations(250);
  const outbox = await processOutbox(100);
  const digests = await processDailyDigests(400);
  return NextResponse.json({ data: { automation, outbox, digests } });
}

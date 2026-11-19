import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { processOutbox } from "@/server/notifications/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Durable backstop for the outbox. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${serverEnv().CRON_SECRET}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }
  const summary = await processOutbox(100);
  return NextResponse.json({ data: summary });
}

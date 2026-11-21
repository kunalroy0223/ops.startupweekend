import { hasPermission } from "@/domain/authz";
import { forbidden, ok, requireApiActor, route } from "@/server/http";
import { processScheduledAutomations } from "@/server/automation/evaluator";
import { processDailyDigests } from "@/server/notifications/digests";
import { processOutbox } from "@/server/notifications/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async (req) => {
  const actor = await requireApiActor(req);
  if (!hasPermission(actor, "automation.rules.manage")) throw forbidden();
  const automation = await processScheduledAutomations(250);
  const outbox = await processOutbox(100);
  const digests = await processDailyDigests(400);
  return ok({ automation, outbox, digests });
});

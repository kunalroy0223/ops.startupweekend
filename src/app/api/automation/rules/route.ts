import { ok, requireApiActor, route } from "@/server/http";
import { listAutomationRules } from "@/server/services/automation";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok({ rules: await listAutomationRules(actor) });
});

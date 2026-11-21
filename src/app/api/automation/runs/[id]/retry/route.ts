import { ok, requireApiActor, route } from "@/server/http";
import { retryAutomationRun } from "@/server/services/automation";

export const POST = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  await retryAutomationRun(actor, params.id, requestId);
  return ok({ queued: true });
});

import { ok, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { submitWorkReport } from "@/server/services/work-reports";

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await submitWorkReport(actor, params.id, requestId);
  kickOutbox();
  return ok({ submitted: true });
});

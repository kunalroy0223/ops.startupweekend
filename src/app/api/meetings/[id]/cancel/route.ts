import { ok, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { cancelMeeting } from "@/server/services/meetings";

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await cancelMeeting(actor, params.id, requestId);
  kickOutbox();
  return ok({ cancelled: true });
});

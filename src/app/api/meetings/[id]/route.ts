import { meetingUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { updateMeeting } from "@/server/services/meetings";

export const PATCH = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, meetingUpdateSchema);
  await updateMeeting(actor, params.id, input, requestId);
  kickOutbox();
  return ok({ updated: true });
});

import { meetingResponseSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { respondToMeeting } from "@/server/services/meetings";

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const { response } = await parseBody(req, meetingResponseSchema);
  await respondToMeeting(actor, params.id, response, requestId);
  kickOutbox();
  return ok({ updated: true });
});

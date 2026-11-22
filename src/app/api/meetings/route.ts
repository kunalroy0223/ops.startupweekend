import { meetingCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { createMeeting, listMeetings } from "@/server/services/meetings";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) <= Date.parse(from)) {
    return ok({ meetings: [] });
  }
  if (Date.parse(to) - Date.parse(from) > 70 * 86_400_000) {
    return ok({ meetings: [] });
  }
  return ok({ meetings: await listMeetings(actor, from, to) });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, meetingCreateSchema);
  const id = await createMeeting(actor, input, requestId);
  kickOutbox();
  return ok({ id }, 201);
});

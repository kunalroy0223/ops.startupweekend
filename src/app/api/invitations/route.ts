import { invitationCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { createInvitation } from "@/server/services/invitations";

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, invitationCreateSchema);
  const result = await createInvitation(actor, input, requestId);
  kickOutbox();
  return ok(result, 201);
});

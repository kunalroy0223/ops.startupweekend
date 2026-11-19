import { invitationAcceptSchema } from "@/domain/validation";
import { assertSameOrigin, ok, parseBody, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { acceptInvitation } from "@/server/services/invitations";

/** Public endpoint: the token itself is the credential. */
export const POST = route(async (req, { requestId }) => {
  assertSameOrigin(req);
  const input = await parseBody(req, invitationAcceptSchema);
  const result = await acceptInvitation(input, requestId);
  kickOutbox();
  return ok({ email: result.email }, 201);
});

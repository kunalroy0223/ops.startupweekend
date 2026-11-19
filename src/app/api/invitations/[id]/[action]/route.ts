import { ApiError, ok, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { resendInvitation, revealInvitationLink, revokeInvitation } from "@/server/services/invitations";

export const POST = route<{ id: string; action: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  switch (params.action) {
    case "resend": {
      const r = await resendInvitation(actor, params.id, requestId);
      kickOutbox();
      return ok(r);
    }
    case "revoke":
      await revokeInvitation(actor, params.id, requestId);
      return ok({ revoked: true });
    case "link":
      return ok(await revealInvitationLink(actor, params.id, requestId));
    default:
      throw new ApiError(404, "not_found", "Unknown action.");
  }
});

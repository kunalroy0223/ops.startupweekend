import { membershipTransferSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { transferTeam } from "@/server/services/structure";

export const POST = route<{ uid: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const { fromTeamId, toTeamId } = await parseBody(req, membershipTransferSchema);
  await transferTeam(actor, params.uid, fromTeamId, toTeamId, requestId);
  kickOutbox();
  return ok({ transferred: true });
});

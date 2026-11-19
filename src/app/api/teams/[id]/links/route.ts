import { teamLinkSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { setTeamLink } from "@/server/services/structure";

export const POST = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const { workstreamId, linked } = await parseBody(req, teamLinkSchema);
  await setTeamLink(actor, params.id, workstreamId, linked, requestId);
  return ok({ linked });
});

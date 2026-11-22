import { programmeUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { updateProgramme } from "@/server/services/operational-modules";

export const PATCH = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, programmeUpdateSchema);
  await updateProgramme(actor, params.id, input, requestId);
  return ok({ updated: true });
});

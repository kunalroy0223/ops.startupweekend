import { programmeSessionCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createProgrammeSession } from "@/server/services/operational-modules";

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, programmeSessionCreateSchema);
  return ok({ id: await createProgrammeSession(actor, input, requestId) }, 201);
});

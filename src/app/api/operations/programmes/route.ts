import { programmeCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createProgramme } from "@/server/services/operational-modules";

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, programmeCreateSchema);
  return ok({ id: await createProgramme(actor, input, requestId) }, 201);
});

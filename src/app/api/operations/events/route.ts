import { operationalEventCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createOperationalEvent } from "@/server/services/operational-modules";

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, operationalEventCreateSchema);
  return ok({ id: await createOperationalEvent(actor, input, requestId) }, 201);
});

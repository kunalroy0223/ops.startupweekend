import { resourceAllocationCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createResourceAllocation } from "@/server/services/operational-modules";

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, resourceAllocationCreateSchema);
  return ok({ id: await createResourceAllocation(actor, input, requestId) }, 201);
});

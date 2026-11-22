import { resourceAllocationUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { updateResourceAllocation } from "@/server/services/operational-modules";

export const PATCH = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, resourceAllocationUpdateSchema);
  await updateResourceAllocation(actor, params.id, input.status, input.decisionNote, requestId);
  return ok({ updated: true });
});

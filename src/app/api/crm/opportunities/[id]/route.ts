import { crmOpportunityUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { updateCrmOpportunity } from "@/server/services/crm-workflows";

export const PATCH = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmOpportunityUpdateSchema);
  await updateCrmOpportunity(actor, params.id, input, requestId);
  return ok({ updated: true });
});

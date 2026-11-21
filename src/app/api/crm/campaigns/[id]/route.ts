import { crmCampaignUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { updateCrmCampaign } from "@/server/services/crm-workflows";

export const PATCH = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmCampaignUpdateSchema);
  await updateCrmCampaign(actor, params.id, input, requestId);
  return ok({ updated: true });
});

import { crmCampaignCreateSchema, crmWorkspaceQuerySchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createCrmCampaign, listCrmWorkflowData } from "@/server/services/crm-workflows";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const { workspaceId } = crmWorkspaceQuerySchema.parse({ workspaceId: req.nextUrl.searchParams.get("workspaceId") });
  const data = await listCrmWorkflowData(actor, workspaceId);
  return ok({ campaigns: data.campaigns });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmCampaignCreateSchema);
  const id = await createCrmCampaign(actor, input, requestId);
  return ok({ id }, 201);
});

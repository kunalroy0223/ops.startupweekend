import { crmCampaignMemberCreateSchema } from "@/domain/validation";
import { ApiError, ok, parseBody, requireApiActor, route } from "@/server/http";
import { addCrmCampaignMember, listCrmWorkflowData } from "@/server/services/crm-workflows";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireApiActor(req);
  const campaignId = params.id;
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) throw new ApiError(400, "workspace_required", "Provide a workspaceId query parameter.");
  const data = await listCrmWorkflowData(actor, workspaceId);
  return ok({ members: data.members.filter((member) => member.campaignId === campaignId) });
});

export const POST = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmCampaignMemberCreateSchema);
  const id = await addCrmCampaignMember(actor, params.id, input, requestId);
  return ok({ id }, 201);
});

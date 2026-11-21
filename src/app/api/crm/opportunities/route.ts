import { crmOpportunityCreateSchema, crmWorkspaceQuerySchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createCrmOpportunity, listCrmWorkflowData } from "@/server/services/crm-workflows";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const { workspaceId } = crmWorkspaceQuerySchema.parse({ workspaceId: req.nextUrl.searchParams.get("workspaceId") });
  const data = await listCrmWorkflowData(actor, workspaceId);
  return ok({ opportunities: data.opportunities });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmOpportunityCreateSchema);
  const id = await createCrmOpportunity(actor, input, requestId);
  return ok({ id }, 201);
});

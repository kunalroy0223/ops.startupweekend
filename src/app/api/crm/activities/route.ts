import { crmActivityCreateSchema, crmWorkspaceQuerySchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createCrmActivity, listCrmWorkflowData } from "@/server/services/crm-workflows";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const { workspaceId } = crmWorkspaceQuerySchema.parse({ workspaceId: req.nextUrl.searchParams.get("workspaceId") });
  const data = await listCrmWorkflowData(actor, workspaceId);
  return ok({ activities: data.activities });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmActivityCreateSchema);
  const id = await createCrmActivity(actor, input, requestId);
  return ok({ id }, 201);
});

import { crmWorkspaceQuerySchema } from "@/domain/validation";
import { ok, requireApiActor, route } from "@/server/http";
import { listCrmWorkflowData } from "@/server/services/crm-workflows";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const { workspaceId } = crmWorkspaceQuerySchema.parse({ workspaceId: req.nextUrl.searchParams.get("workspaceId") });
  return ok(await listCrmWorkflowData(actor, workspaceId));
});

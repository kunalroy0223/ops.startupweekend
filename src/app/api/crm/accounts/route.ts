import { crmAccountCreateSchema, crmWorkspaceQuerySchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createCrmAccount, listCrmAccounts } from "@/server/services/crm";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const { workspaceId } = crmWorkspaceQuerySchema.parse({ workspaceId: req.nextUrl.searchParams.get("workspaceId") });
  return ok({ accounts: await listCrmAccounts(actor, workspaceId) });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmAccountCreateSchema);
  const id = await createCrmAccount(actor, input, requestId);
  return ok({ id }, 201);
});

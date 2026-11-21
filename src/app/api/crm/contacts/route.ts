import { crmContactCreateSchema, crmWorkspaceQuerySchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createCrmContact, listCrmContacts } from "@/server/services/crm";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const { workspaceId } = crmWorkspaceQuerySchema.parse({ workspaceId: req.nextUrl.searchParams.get("workspaceId") });
  return ok({ contacts: await listCrmContacts(actor, workspaceId) });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmContactCreateSchema);
  const id = await createCrmContact(actor, input, requestId);
  return ok({ id }, 201);
});

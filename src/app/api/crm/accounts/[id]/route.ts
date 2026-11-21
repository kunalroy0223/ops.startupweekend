import { crmAccountUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { archiveCrmAccount, getCrmAccount, updateCrmAccount } from "@/server/services/crm";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireApiActor(req);
  return ok({ account: await getCrmAccount(actor, params.id) });
});

export const PATCH = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmAccountUpdateSchema);
  await updateCrmAccount(actor, params.id, input, requestId);
  return ok({ updated: true });
});

export const DELETE = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  await archiveCrmAccount(actor, params.id, requestId);
  return ok({ archived: true });
});

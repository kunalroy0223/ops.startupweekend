import { crmContactUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { archiveCrmContact, getCrmContact, updateCrmContact } from "@/server/services/crm";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireApiActor(req);
  return ok({ contact: await getCrmContact(actor, params.id) });
});

export const PATCH = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmContactUpdateSchema);
  await updateCrmContact(actor, params.id, input, requestId);
  return ok({ updated: true });
});

export const DELETE = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  await archiveCrmContact(actor, params.id, requestId);
  return ok({ archived: true });
});

import { crmDoNotContactSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { setCrmContactDoNotContact } from "@/server/services/crm";

export const POST = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, crmDoNotContactSchema);
  await setCrmContactDoNotContact(actor, params.id, input.doNotContact, input.reason, requestId);
  return ok({ updated: true, doNotContact: input.doNotContact });
});

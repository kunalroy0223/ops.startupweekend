import { organizationSettingsSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { updateOrganization } from "@/server/services/organization";

export const PATCH = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  await updateOrganization(actor, await parseBody(req, organizationSettingsSchema), requestId);
  return ok({ saved: true });
});

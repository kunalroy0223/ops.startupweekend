import { notificationPreferencesSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { updatePreferences } from "@/server/services/notifications";

export const PUT = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  await updatePreferences(actor, await parseBody(req, notificationPreferencesSchema), requestId);
  return ok({ saved: true });
});

import { hasPermission } from "@/domain/authz";
import { forbidden, ok, requireApiActor, route } from "@/server/http";
import { processOutbox } from "@/server/notifications/processor";

export const POST = route(async (req) => {
  const actor = await requireApiActor(req);
  if (!hasPermission(actor, "notifications.administer")) throw forbidden();
  return ok(await processOutbox(50));
});

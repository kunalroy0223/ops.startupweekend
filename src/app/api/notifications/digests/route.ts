import { ok, requireApiActor, route } from "@/server/http";
import { listNotificationDigests } from "@/server/services/digests";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok({ digests: await listNotificationDigests(actor) });
});

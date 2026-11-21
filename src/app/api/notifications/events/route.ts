import { ok, requireApiActor, route } from "@/server/http";
import { listFailedDomainEvents } from "@/server/services/domain-events";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok({ events: await listFailedDomainEvents(actor) });
});

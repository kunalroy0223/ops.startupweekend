import { ok, requireApiActor, route } from "@/server/http";
import { listEmailDeliveries } from "@/server/services/email-deliveries";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok({ deliveries: await listEmailDeliveries(actor) });
});

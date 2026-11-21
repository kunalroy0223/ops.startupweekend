import { ok, requireApiActor, route } from "@/server/http";
import { retryEmailDelivery } from "@/server/services/email-deliveries";

export const POST = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  await retryEmailDelivery(actor, params.id, requestId);
  return ok({ queued: true });
});

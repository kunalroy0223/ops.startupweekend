import { ok, requireApiActor, route } from "@/server/http";
import { retryFailedDomainEvent } from "@/server/services/domain-events";

export const POST = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  await retryFailedDomainEvent(actor, params.id, requestId);
  return ok({ queued: true });
});

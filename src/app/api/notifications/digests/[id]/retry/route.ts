import { ok, requireApiActor, route } from "@/server/http";
import { retryNotificationDigest } from "@/server/services/digests";

export const POST = route<{ id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  await retryNotificationDigest(actor, params.id, requestId);
  return ok({ queued: true });
});

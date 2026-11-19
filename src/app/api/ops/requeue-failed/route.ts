import { hasPermission } from "@/domain/authz";
import { writeAudit } from "@/server/audit";
import { adminDb } from "@/server/firebase-admin";
import { forbidden, ok, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { requeueFailedDeliveries } from "@/server/notifications/processor";

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  if (!hasPermission(actor, "notifications.administer")) throw forbidden();
  const requeued = await requeueFailedDeliveries();
  const batch = adminDb().batch();
  writeAudit(batch, { actorUserId: actor.uid, action: "email.failed_requeued", resourceType: "emailDeliveries", resourceId: "bulk", after: { requeued }, requestId });
  await batch.commit();
  kickOutbox();
  return ok({ requeued });
});

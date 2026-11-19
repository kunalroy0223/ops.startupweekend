import { statusChangeSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { changeStatus } from "@/server/services/users";

export const POST = route<{ uid: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const { status, reason } = await parseBody(req, statusChangeSchema);
  const result = await changeStatus(actor, params.uid, status, reason, requestId);
  kickOutbox();
  return ok(result);
});

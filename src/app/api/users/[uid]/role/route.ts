import { roleChangeSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { changeRole } from "@/server/services/users";

export const POST = route<{ uid: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const { role, reason } = await parseBody(req, roleChangeSchema);
  await changeRole(actor, params.uid, role, reason, requestId);
  kickOutbox();
  return ok({ role });
});

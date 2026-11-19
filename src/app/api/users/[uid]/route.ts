import { userAdminUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { adminUpdateProfile } from "@/server/services/users";

export const PATCH = route<{ uid: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, userAdminUpdateSchema);
  await adminUpdateProfile(actor, params.uid, input, requestId);
  return ok({ updated: true });
});

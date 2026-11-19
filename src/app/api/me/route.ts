import { profileSelfUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { updateOwnProfile } from "@/server/services/users";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok({ uid: actor.uid, role: actor.role, displayName: actor.displayName, email: actor.email });
});

export const PATCH = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, profileSelfUpdateSchema);
  await updateOwnProfile(actor, input, requestId);
  return ok({ updated: true });
});

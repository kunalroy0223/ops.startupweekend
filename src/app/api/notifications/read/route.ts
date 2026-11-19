import { markReadSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { markRead } from "@/server/services/notifications";

export const POST = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok({ updated: await markRead(actor, await parseBody(req, markReadSchema)) });
});

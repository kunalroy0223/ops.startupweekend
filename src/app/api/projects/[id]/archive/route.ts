import { archiveSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { setProjectArchived } from "@/server/services/tasks";

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const { archived } = await parseBody(req, archiveSchema);
  await setProjectArchived(actor, params.id, archived, requestId);
  return ok({ updated: true });
});

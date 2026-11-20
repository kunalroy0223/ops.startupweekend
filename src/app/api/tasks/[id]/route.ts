import { taskUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { updateTask } from "@/server/services/tasks";

export const PATCH = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, taskUpdateSchema);
  await updateTask(actor, params.id, input, requestId);
  kickOutbox();
  return ok({ updated: true });
});

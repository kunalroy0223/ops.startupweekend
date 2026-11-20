import { taskStatusSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { changeTaskStatus } from "@/server/services/tasks";

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, taskStatusSchema);
  await changeTaskStatus(actor, params.id, input.status, input.reason, requestId);
  kickOutbox();
  return ok({ updated: true });
});

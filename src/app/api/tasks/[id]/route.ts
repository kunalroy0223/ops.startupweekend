import { taskUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { deleteTask, restoreTask, updateTask } from "@/server/services/tasks";

export const PATCH = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, taskUpdateSchema);
  await updateTask(actor, params.id, input, requestId);
  kickOutbox();
  return ok({ updated: true });
});

export const DELETE = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await deleteTask(actor, params.id, requestId);
  return ok({ deleted: true });
});

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await restoreTask(actor, params.id, requestId);
  return ok({ restored: true });
});

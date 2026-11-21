import { ok, requireApiActor, route } from "@/server/http";
import { deleteTaskComment } from "@/server/services/task-collaboration";

export const DELETE = route<{ id: string; commentId: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await deleteTaskComment(actor, params.id, params.commentId, requestId);
  return ok({ deleted: true });
});

import { taskCommentSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { addTaskComment } from "@/server/services/task-collaboration";

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, taskCommentSchema);
  await addTaskComment(actor, params.id, input.body, input.mentionedUserIds, requestId);
  kickOutbox();
  return ok({ created: true }, 201);
});

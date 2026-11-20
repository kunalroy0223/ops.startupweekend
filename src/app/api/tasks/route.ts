import { taskCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { createTask, listTasks } from "@/server/services/tasks";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok({ tasks: await listTasks(actor) });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, taskCreateSchema);
  const id = await createTask(actor, input, requestId);
  kickOutbox();
  return ok({ id }, 201);
});

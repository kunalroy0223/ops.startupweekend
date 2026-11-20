import { notFound, ok, requireApiActor, route } from "@/server/http";
import { getTaskDetail } from "@/server/services/task-collaboration";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireApiActor(req);
  const detail = await getTaskDetail(actor, params.id);
  if (!detail) throw notFound("Task not found.");
  return ok(detail);
});

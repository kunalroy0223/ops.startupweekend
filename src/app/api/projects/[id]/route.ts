import { projectUpdateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { setProjectArchived, updateProject } from "@/server/services/tasks";

export const PATCH = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, projectUpdateSchema);
  await updateProject(actor, params.id, input, requestId);
  return ok({ updated: true });
});

export const DELETE = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await setProjectArchived(actor, params.id, true, requestId);
  return ok({ deleted: true });
});

import { projectCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createProject, listProjects } from "@/server/services/tasks";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok({ projects: await listProjects(actor) });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, projectCreateSchema);
  const id = await createProject(actor, input, requestId);
  return ok({ id }, 201);
});

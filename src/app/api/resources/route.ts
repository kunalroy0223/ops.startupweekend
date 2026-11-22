import { resourceCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createManagedResource, listResourceWorkspace } from "@/server/services/operational-modules";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
  if (!workspaceId) return ok({ resources: [], allocations: [] });
  return ok(await listResourceWorkspace(actor, workspaceId));
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, resourceCreateSchema);
  return ok({ id: await createManagedResource(actor, input, requestId) }, 201);
});

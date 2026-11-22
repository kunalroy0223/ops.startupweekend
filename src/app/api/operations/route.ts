import { ok, requireApiActor, route } from "@/server/http";
import { listOperationsWorkspace } from "@/server/services/operational-modules";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
  if (!workspaceId) return ok({ programmes: [], events: [], sessions: [] });
  return ok(await listOperationsWorkspace(actor, workspaceId));
});

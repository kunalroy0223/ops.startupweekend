import { teamUpsertSchema, workspaceUpsertSchema, workstreamUpsertSchema } from "@/domain/validation";
import { ApiError, ok, parseBody, requireApiActor, route } from "@/server/http";
import { createResource } from "@/server/services/structure";

export const POST = route<{ kind: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  switch (params.kind) {
    case "workspaces":
      return ok({ id: await createResource(actor, "workspace", await parseBody(req, workspaceUpsertSchema), requestId) }, 201);
    case "workstreams":
      return ok({ id: await createResource(actor, "workstream", await parseBody(req, workstreamUpsertSchema), requestId) }, 201);
    case "teams":
      return ok({ id: await createResource(actor, "team", await parseBody(req, teamUpsertSchema), requestId) }, 201);
    default:
      throw new ApiError(404, "not_found", "Unknown resource.");
  }
});

import { workspaceUpsertSchema } from "@/domain/validation";
import { ApiError, ok, parseBody, requireApiActor, route } from "@/server/http";
import { updateResource } from "@/server/services/structure";

const KINDS = { workspaces: "workspace", workstreams: "workstream", teams: "team" } as const;

export const PATCH = route<{ kind: string; id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const kind = KINDS[params.kind as keyof typeof KINDS];
  if (!kind) throw new ApiError(404, "not_found", "Unknown resource.");
  await updateResource(actor, kind, params.id, await parseBody(req, workspaceUpsertSchema), requestId);
  return ok({ updated: true });
});

import { archiveSchema } from "@/domain/validation";
import { ApiError, ok, parseBody, requireApiActor, route } from "@/server/http";
import { setArchived } from "@/server/services/structure";

const KINDS = { workspaces: "workspace", workstreams: "workstream", teams: "team" } as const;

export const POST = route<{ kind: string; id: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const kind = KINDS[params.kind as keyof typeof KINDS];
  if (!kind) throw new ApiError(404, "not_found", "Unknown resource.");
  const { archived } = await parseBody(req, archiveSchema);
  await setArchived(actor, kind, params.id, archived, requestId);
  return ok({ archived });
});

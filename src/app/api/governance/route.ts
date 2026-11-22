import { ok, requireApiActor, route } from "@/server/http";
import { listGovernanceWorkspace } from "@/server/services/operational-modules";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  return ok(await listGovernanceWorkspace(actor));
});

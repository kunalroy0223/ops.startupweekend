import { governancePolicyCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createGovernancePolicy } from "@/server/services/operational-modules";

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, governancePolicyCreateSchema);
  return ok({ id: await createGovernancePolicy(actor, input, requestId) }, 201);
});

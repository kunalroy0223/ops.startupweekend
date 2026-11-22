import { governanceReviewCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createGovernanceReview } from "@/server/services/operational-modules";

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, governanceReviewCreateSchema);
  await createGovernanceReview(actor, input, requestId);
  return ok({ recorded: true }, 201);
});

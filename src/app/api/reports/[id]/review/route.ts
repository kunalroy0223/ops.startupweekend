import { workReportReviewSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { reviewWorkReport } from "@/server/services/work-reports";

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, workReportReviewSchema);
  await reviewWorkReport(actor, params.id, input, requestId);
  kickOutbox();
  return ok({ reviewed: true });
});

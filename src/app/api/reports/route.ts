import { workReportCreateSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { createOrOpenReport, listMyReports, listReviewQueue } from "@/server/services/work-reports";

export const GET = route(async req => {
  const actor = await requireApiActor(req);
  const [mine, reviewQueue] = await Promise.all([listMyReports(actor), listReviewQueue(actor)]);
  return ok({ mine, reviewQueue });
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, workReportCreateSchema);
  const id = await createOrOpenReport(actor, input, requestId);
  return ok({ id }, 201);
});

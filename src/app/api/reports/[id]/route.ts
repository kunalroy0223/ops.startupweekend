import { ok, requireApiActor, route } from "@/server/http";
import { getWorkReportDetail } from "@/server/services/work-reports";
import { notFound } from "@/server/http";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireApiActor(req);
  const detail = await getWorkReportDetail(actor, params.id);
  if (!detail) throw notFound("Work report not found.");
  return ok(detail);
});

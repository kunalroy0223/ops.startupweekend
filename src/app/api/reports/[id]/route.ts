import { ok, requireApiActor, route } from "@/server/http";
import { deleteWorkReport, getWorkReportDetail, restoreWorkReport } from "@/server/services/work-reports";
import { notFound } from "@/server/http";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireApiActor(req);
  const detail = await getWorkReportDetail(actor, params.id);
  if (!detail) throw notFound("Work report not found.");
  return ok(detail);
});

export const DELETE = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await deleteWorkReport(actor, params.id, requestId);
  return ok({ deleted: true });
});

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await restoreWorkReport(actor, params.id, requestId);
  return ok({ restored: true });
});

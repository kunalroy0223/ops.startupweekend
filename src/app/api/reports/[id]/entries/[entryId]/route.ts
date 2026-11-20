import { workReportEntrySchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { deleteWorkReportEntry, updateWorkReportEntry } from "@/server/services/work-reports";

export const PATCH = route<{ id: string; entryId: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, workReportEntrySchema);
  await updateWorkReportEntry(actor, params.id, params.entryId, input, requestId);
  return ok({ updated: true });
});

export const DELETE = route<{ id: string; entryId: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  await deleteWorkReportEntry(actor, params.id, params.entryId, requestId);
  return ok({ deleted: true });
});

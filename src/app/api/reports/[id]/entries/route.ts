import { workReportEntrySchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { addWorkReportEntry } from "@/server/services/work-reports";

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, workReportEntrySchema);
  const id = await addWorkReportEntry(actor, params.id, input, requestId);
  return ok({ id }, 201);
});

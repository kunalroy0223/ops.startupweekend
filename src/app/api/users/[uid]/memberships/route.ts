import { z } from "zod";
import { membershipAssignSchema } from "@/domain/validation";
import { ok, parseBody, requireApiActor, route } from "@/server/http";
import { kickOutbox } from "@/server/kick";
import { assignMembership, removeMembership } from "@/server/services/structure";

export const POST = route<{ uid: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = await parseBody(req, membershipAssignSchema);
  await assignMembership(actor, params.uid, input, requestId);
  kickOutbox();
  return ok({ assigned: true }, 201);
});

const removeSchema = z.object({ scopeKind: z.enum(["team", "workstream"]), scopeId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) });

export const DELETE = route<{ uid: string }>(async (req, { requestId, params }) => {
  const actor = await requireApiActor(req);
  const input = removeSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  await removeMembership(actor, params.uid, input.scopeKind, input.scopeId, requestId);
  kickOutbox();
  return ok({ removed: true });
});

import "server-only";
import { hasPermission, type Actor } from "@/domain/authz";
import { writeAudit } from "../audit";
import { col, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { forbidden, notFound } from "../http";

export async function updateOrganization(actor: Actor, input: { name: string; timezone: string }, requestId: string) {
  if (!hasPermission(actor, "settings.manage")) throw forbidden();
  const ref = col("organizations").doc(serverEnv().ORGANIZATION_ID);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("Organisation record missing. Run the bootstrap script.");
    const before = snap.data()!;
    tx.update(ref, { name: input.name, timezone: input.timezone, updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "organization.updated", resourceType: "organization", resourceId: ref.id, before: { name: before.name, timezone: before.timezone }, after: input, requestId });
  });
}

import "server-only";
import { canUseOrganization, type Actor } from "@/domain/authz";
import { col } from "../db";
import { forbidden } from "../http";

/**
 * The API actor is server-derived, but role and status can change after a
 * session is issued. Re-read the canonical user profile before any privileged
 * CRM or automation service operation. The current deployment is configured
 * for one organisation; actor.organizationId must match that deployment.
 */
export function assertActorProfile(
  actor: Actor,
  organizationId: string,
  profile: { organizationId?: string; role?: Actor["role"]; status?: Actor["status"] } | null | undefined,
): void {
  if (!canUseOrganization(actor, organizationId, profile)) {
    throw forbidden("Your account is not an active member of this organisation. Refresh your session or contact an Admin.");
  }
}

export async function assertActorInOrganization(actor: Actor, organizationId: string): Promise<void> {
  const userSnap = await col("users").doc(actor.uid).get();
  assertActorProfile(actor, organizationId, userSnap.exists ? userSnap.data() : undefined);
}

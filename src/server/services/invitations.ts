import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { hasPermission, type Actor } from "@/domain/authz";
import type { Invitation, UserProfile } from "@/domain/types";
import { searchKey, type InvitationCreateInput } from "@/domain/validation";
import { enqueueEvent, writeAudit } from "../audit";
import { COL, col, fromDoc, membershipId, now, SCHEMA_VERSION, tsFromMs } from "../db";
import { adminAuth, adminDb } from "../firebase-admin";
import { appUrl, serverEnv } from "../env";
import { ApiError, conflict, forbidden, notFound } from "../http";
import { generateToken, hashToken, seal, unseal } from "../tokens";

type StoredInvitation = Invitation & { tokenHash: string; tokenCiphertext?: string; tokenVersion: number };

async function assertScopesValid(workspaceId: string, workstreamIds: string[], teamIds: string[]) {
  const db = adminDb();
  const ws = await col("workspaces").doc(workspaceId).get();
  if (!ws.exists || ws.data()?.status !== "active") throw new ApiError(422, "invalid_workspace", "Choose an active workspace.", { workspaceId: "Choose an active workspace" });
  const refs = [...workstreamIds.map((id) => db.collection(COL.workstreams).doc(id)), ...teamIds.map((id) => db.collection(COL.teams).doc(id))];
  if (!refs.length) return;
  const snaps = await db.getAll(...refs);
  for (const s of snaps) {
    if (!s.exists || s.data()?.status !== "active" || s.data()?.workspaceId !== workspaceId) {
      throw new ApiError(422, "invalid_scope", "One of the chosen teams or workstreams is archived or belongs to another workspace.");
    }
  }
}

export async function createInvitation(actor: Actor, input: InvitationCreateInput, requestId: string) {
  if (!hasPermission(actor, "users.invite")) throw forbidden();
  const env = serverEnv();
  const email = input.email.trim();
  const emailNormalized = email.toLowerCase();
  await assertScopesValid(input.workspaceId, input.workstreamIds, input.teamIds);

  const existingUser = await col("users").where("emailNormalized", "==", emailNormalized).limit(1).get();
  if (!existingUser.empty) throw conflict("user_exists", "Someone with this email already has an account.");
  const pending = await col("invitations").where("emailNormalized", "==", emailNormalized).where("status", "==", "pending").limit(1).get();
  if (!pending.empty) throw conflict("invitation_pending", "This email already has a pending invitation. Resend it instead.");

  const token = generateToken();
  const ref = col("invitations").doc();
  const expiresAt = tsFromMs(Date.now() + env.INVITATION_TTL_HOURS * 3_600_000);
  const batch = adminDb().batch();
  batch.set(ref, {
    organizationId: env.ORGANIZATION_ID,
    email,
    emailNormalized,
    intendedRole: input.intendedRole,
    workspaceIds: [input.workspaceId],
    initialWorkstreamIds: input.workstreamIds,
    initialTeamIds: input.teamIds,
    status: "pending",
    tokenHash: hashToken(token),
    tokenCiphertext: seal(token),
    tokenVersion: 1,
    expiresAt,
    invitedBy: actor.uid,
    createdAt: now(),
    updatedAt: now(),
  });
  writeAudit(batch, {
    actorUserId: actor.uid,
    action: "invitation.created",
    resourceType: "invitation",
    resourceId: ref.id,
    workspaceId: input.workspaceId,
    after: { email: emailNormalized, intendedRole: input.intendedRole, workstreamIds: input.workstreamIds, teamIds: input.teamIds },
    requestId,
  });
  enqueueEvent(batch, { eventType: "USER_INVITED", actorUserId: actor.uid, resourceType: "invitation", resourceId: ref.id, workspaceId: input.workspaceId, payload: { invitationId: ref.id, tokenVersion: 1 } });
  await batch.commit();
  return { invitationId: ref.id, inviteUrl: appUrl(`/invite/${token}`) };
}

async function loadPendingForAdmin(actor: Actor, id: string) {
  if (!hasPermission(actor, "users.invite")) throw forbidden();
  const snap = await col("invitations").doc(id).get();
  if (!snap.exists) throw notFound("Invitation not found.");
  const inv = fromDoc<StoredInvitation>(snap);
  if (inv.status !== "pending") throw conflict("not_pending", `This invitation is ${inv.status}.`);
  return { snap, inv };
}

export async function resendInvitation(actor: Actor, id: string, requestId: string) {
  const { inv } = await loadPendingForAdmin(actor, id);
  const token = generateToken();
  const ref = col("invitations").doc(id);
  const version = (inv.tokenVersion ?? 1) + 1;
  await adminDb().runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.status !== "pending") throw conflict("not_pending", "This invitation is no longer pending.");
    // Superseding the hash invalidates every earlier link immediately.
    tx.update(ref, {
      tokenHash: hashToken(token),
      tokenCiphertext: seal(token),
      tokenVersion: version,
      expiresAt: tsFromMs(Date.now() + serverEnv().INVITATION_TTL_HOURS * 3_600_000),
      updatedAt: now(),
    });
    writeAudit(tx, { actorUserId: actor.uid, action: "invitation.resent", resourceType: "invitation", resourceId: id, after: { tokenVersion: version }, requestId });
    enqueueEvent(tx, { eventType: "INVITATION_RESENT", actorUserId: actor.uid, resourceType: "invitation", resourceId: id, payload: { invitationId: id, tokenVersion: version } });
  });
  return { inviteUrl: appUrl(`/invite/${token}`) };
}

export async function revokeInvitation(actor: Actor, id: string, requestId: string) {
  await loadPendingForAdmin(actor, id);
  const ref = col("invitations").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.status !== "pending") throw conflict("not_pending", "This invitation is no longer pending.");
    tx.update(ref, { status: "revoked", tokenCiphertext: FieldValue.delete(), updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "invitation.revoked", resourceType: "invitation", resourceId: id, before: { status: "pending" }, after: { status: "revoked" }, requestId });
  });
}

/** Lets an Admin copy a pending link when email delivery is not configured. Audited. */
export async function revealInvitationLink(actor: Actor, id: string, requestId: string) {
  const { inv } = await loadPendingForAdmin(actor, id);
  if (!inv.tokenCiphertext) throw conflict("no_link", "This invitation has no retrievable link. Resend it.");
  const batch = adminDb().batch();
  writeAudit(batch, { actorUserId: actor.uid, action: "invitation.link_viewed", resourceType: "invitation", resourceId: id, requestId });
  await batch.commit();
  return { inviteUrl: appUrl(`/invite/${unseal(inv.tokenCiphertext)}`) };
}

export type InvitationLookup =
  | { state: "valid"; email: string; intendedRole: Invitation["intendedRole"]; inviterName: string; expiresAt: string }
  | { state: "invalid" | "expired" | "used" | "revoked" };

/** Public lookup by raw token. Reveals nothing unless the token matches a stored hash. */
export async function lookupInvitation(token: string): Promise<InvitationLookup> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return { state: "invalid" };
  const snap = await col("invitations").where("tokenHash", "==", hashToken(token)).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return { state: "invalid" };
  const inv = fromDoc<StoredInvitation>(doc);
  if (inv.organizationId !== serverEnv().ORGANIZATION_ID) return { state: "invalid" };
  if (inv.status === "accepted") return { state: "used" };
  if (inv.status === "revoked") return { state: "revoked" };
  if (inv.status === "expired" || Date.parse(inv.expiresAt) < Date.now()) return { state: "expired" };
  const inviter = await col("users").doc(inv.invitedBy).get();
  return { state: "valid", email: inv.email, intendedRole: inv.intendedRole, inviterName: String(inviter.data()?.displayName ?? "An Admin"), expiresAt: inv.expiresAt };
}

/**
 * Consumes an invitation: creates the Firebase Auth account, provisions the
 * profile and initial memberships, and marks the invitation accepted, all
 * guarded by a transaction that re-checks the invitation is still pending.
 */
export async function acceptInvitation(input: { token: string; displayName: string; password: string }, requestId: string) {
  const env = serverEnv();
  const tokenHash = hashToken(input.token);
  const found = await col("invitations").where("tokenHash", "==", tokenHash).limit(1).get();
  const doc = found.docs[0];
  if (!doc) throw new ApiError(404, "invalid_invitation", "This invitation link is not valid.");
  const inv = fromDoc<StoredInvitation>(doc);
  if (inv.status !== "pending") throw conflict("invitation_" + inv.status, "This invitation has already been used or withdrawn.");
  if (Date.parse(inv.expiresAt) < Date.now()) {
    await doc.ref.update({ status: "expired", tokenCiphertext: FieldValue.delete(), updatedAt: now() });
    throw new ApiError(410, "invitation_expired", "This invitation has expired. Ask your Admin to resend it.");
  }

  const auth = adminAuth();
  let uid: string;
  let createdAuthUser = false;
  try {
    const existing = await auth.getUserByEmail(inv.emailNormalized);
    const profile = await col("users").doc(existing.uid).get();
    if (profile.exists) throw conflict("user_exists", "An account with this email already exists. Sign in instead.");
    // Orphaned auth user from an interrupted earlier attempt: adopt it.
    await auth.updateUser(existing.uid, { password: input.password, displayName: input.displayName, emailVerified: true, disabled: false });
    uid = existing.uid;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    // The token reached this person at this address, so the address is verified.
    const created = await auth.createUser({ email: inv.emailNormalized, password: input.password, displayName: input.displayName, emailVerified: true });
    uid = created.uid;
    createdAuthUser = true;
  }

  const role = inv.intendedRole;
  const workspaceId = inv.workspaceIds[0]!;
  const membershipType = role === "lead" ? "lead" : "member";
  try {
    await adminDb().runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (fresh.data()?.status !== "pending" || fresh.data()?.tokenHash !== tokenHash) throw conflict("invitation_consumed", "This invitation has already been used.");
      const profile: Omit<UserProfile, "uid" | "createdAt" | "updatedAt"> & Record<string, unknown> = {
        organizationId: env.ORGANIZATION_ID,
        email: inv.email,
        emailNormalized: inv.emailNormalized,
        displayName: input.displayName,
        searchName: searchKey(input.displayName),
        role,
        status: "active",
        invitedBy: inv.invitedBy,
        schemaVersion: SCHEMA_VERSION,
      };
      tx.create(col("users").doc(uid), { ...profile, createdAt: now(), updatedAt: now() });
      tx.set(col("notificationPreferences").doc(uid), { organizationId: env.ORGANIZATION_ID, userId: uid, inAppEnabled: true, emailEnabled: true, deliveryMode: "immediate", disabledEventTypes: [], updatedAt: now() });
      const base = { organizationId: env.ORGANIZATION_ID, workspaceId, userId: uid, membershipType, status: "active", assignedBy: inv.invitedBy, assignedAt: now() };
      for (const id of inv.initialWorkstreamIds ?? []) tx.set(col("workstreamMemberships").doc(membershipId(id, uid)), { ...base, workstreamId: id });
      for (const id of inv.initialTeamIds ?? []) tx.set(col("teamMemberships").doc(membershipId(id, uid)), { ...base, teamId: id });
      tx.update(doc.ref, { status: "accepted", acceptedBy: uid, acceptedAt: now(), tokenCiphertext: FieldValue.delete(), updatedAt: now() });
      writeAudit(tx, {
        actorUserId: uid,
        action: "user.created_from_invitation",
        resourceType: "user",
        resourceId: uid,
        subjectUserIds: [uid, inv.invitedBy],
        workspaceId,
        after: { role, email: inv.emailNormalized, teamIds: inv.initialTeamIds ?? [], workstreamIds: inv.initialWorkstreamIds ?? [], invitationId: inv.id },
        requestId,
      });
      enqueueEvent(tx, { eventType: "ACCOUNT_ACTIVATED", actorUserId: uid, resourceType: "user", resourceId: uid, workspaceId, payload: { userId: uid, invitedBy: inv.invitedBy } });
    });
  } catch (err) {
    if (createdAuthUser) await auth.deleteUser(uid).catch(() => undefined);
    throw err;
  }
  return { uid, email: inv.emailNormalized };
}

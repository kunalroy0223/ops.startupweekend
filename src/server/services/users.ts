import "server-only";
import { decideRoleChange, decideStatusChange, hasPermission, type Actor } from "@/domain/authz";
import type { Role, UserProfile, UserStatus } from "@/domain/types";
import { searchKey } from "@/domain/validation";
import { enqueueEvent, writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { adminAuth, adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { ApiError, forbidden, notFound } from "../http";

function activeAdminsQuery() {
  return col("users").where("organizationId", "==", serverEnv().ORGANIZATION_ID).where("role", "==", "admin").where("status", "==", "active");
}

export async function updateOwnProfile(actor: Actor, input: { displayName?: string; title?: string }, requestId: string) {
  const ref = col("users").doc(actor.uid);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const before = snap.data() ?? {};
    const patch: Record<string, unknown> = { updatedAt: now() };
    if (input.displayName !== undefined) {
      patch.displayName = input.displayName;
      patch.searchName = searchKey(input.displayName);
    }
    if (input.title !== undefined) patch.title = input.title;
    tx.update(ref, patch);
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "user.profile_updated",
      resourceType: "user",
      resourceId: actor.uid,
      subjectUserIds: [actor.uid],
      before: { displayName: before.displayName, title: before.title },
      after: { displayName: input.displayName ?? before.displayName, title: input.title ?? before.title },
      requestId,
    });
  });
  if (input.displayName) await adminAuth().updateUser(actor.uid, { displayName: input.displayName });
}

export async function adminUpdateProfile(actor: Actor, uid: string, input: { displayName?: string; title?: string }, requestId: string) {
  if (!hasPermission(actor, "users.edit")) throw forbidden();
  if (uid === actor.uid) return updateOwnProfile(actor, input, requestId);
  const ref = col("users").doc(uid);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("User not found.");
    const before = snap.data()!;
    const patch: Record<string, unknown> = { updatedAt: now() };
    if (input.displayName !== undefined) {
      patch.displayName = input.displayName;
      patch.searchName = searchKey(input.displayName);
    }
    if (input.title !== undefined) patch.title = input.title;
    tx.update(ref, patch);
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "user.profile_updated",
      resourceType: "user",
      resourceId: uid,
      subjectUserIds: [uid],
      before: { displayName: before.displayName, title: before.title },
      after: { displayName: input.displayName ?? before.displayName, title: input.title ?? before.title },
      requestId,
    });
  });
  if (input.displayName) await adminAuth().updateUser(uid, { displayName: input.displayName });
}

/**
 * Role change. The active-Admin count is read inside the transaction so two
 * concurrent demotions cannot remove the last Admin. Demotion to Team Member
 * downgrades that person's Lead assignments in the same transaction.
 */
export async function changeRole(actor: Actor, uid: string, role: Role, reason: string | undefined, requestId: string) {
  const ref = col("users").doc(uid);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("User not found.");
    const target = fromDoc<UserProfile>(snap, "uid");
    const admins = await tx.get(activeAdminsQuery());
    const decision = decideRoleChange(actor, target, role, admins.size);
    if (!decision.ok) throw new ApiError(decision.code === "forbidden" ? 403 : 409, decision.code, decision.message);

    let downgraded: string[] = [];
    if (role === "member") {
      const [teamLeads, streamLeads] = await Promise.all([
        tx.get(col("teamMemberships").where("userId", "==", uid).where("membershipType", "==", "lead").where("status", "==", "active")),
        tx.get(col("workstreamMemberships").where("userId", "==", uid).where("membershipType", "==", "lead").where("status", "==", "active")),
      ]);
      for (const d of [...teamLeads.docs, ...streamLeads.docs]) tx.update(d.ref, { membershipType: "member" });
      downgraded = [...teamLeads.docs, ...streamLeads.docs].map((d) => d.ref.path);
    }
    tx.update(ref, { role, updatedAt: now() });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "user.role_changed",
      resourceType: "user",
      resourceId: uid,
      subjectUserIds: [uid],
      before: { role: target.role },
      after: { role, reason: reason ?? null, downgradedLeadAssignments: downgraded },
      requestId,
    });
    enqueueEvent(tx, { eventType: "USER_ROLE_CHANGED", actorUserId: actor.uid, resourceType: "user", resourceId: uid, payload: { userId: uid, from: target.role, to: role } });
  });
}

/**
 * Account status change. Firestore is updated first (the authoritative
 * check), then Firebase Auth is disabled and refresh tokens revoked, so open
 * sessions fail their next server-verified request.
 */
export async function changeStatus(actor: Actor, uid: string, status: UserStatus, reason: string | undefined, requestId: string) {
  const ref = col("users").doc(uid);
  let previous: UserStatus = "active";
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("User not found.");
    const target = fromDoc<UserProfile>(snap, "uid");
    previous = target.status;
    const admins = await tx.get(activeAdminsQuery());
    const decision = decideStatusChange(actor, target, status, admins.size);
    if (!decision.ok) throw new ApiError(decision.code === "forbidden" ? 403 : 409, decision.code, decision.message);
    tx.update(ref, { status, updatedAt: now(), ...(status === "deactivated" ? { deactivatedAt: now() } : {}) });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "user.status_changed",
      resourceType: "user",
      resourceId: uid,
      subjectUserIds: [uid],
      before: { status: target.status },
      after: { status, reason: reason ?? null },
      requestId,
    });
    enqueueEvent(tx, { eventType: "ACCOUNT_STATUS_CHANGED", actorUserId: actor.uid, resourceType: "user", resourceId: uid, payload: { userId: uid, from: target.status, to: status } });
  });
  const auth = adminAuth();
  await auth.updateUser(uid, { disabled: status !== "active" });
  if (status !== "active") await auth.revokeRefreshTokens(uid);
  return { from: previous, to: status };
}

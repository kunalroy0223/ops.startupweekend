import "server-only";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { hasPermission, type Actor } from "@/domain/authz";
import type { MembershipType } from "@/domain/types";
import { slugify } from "@/domain/validation";
import { enqueueEvent, writeAudit } from "../audit";
import { col, membershipId, now, workstreamTeamId } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { ApiError, conflict, forbidden, notFound } from "../http";

type Kind = "workspace" | "workstream" | "team";
const collectionOf = { workspace: "workspaces", workstream: "workstreams", team: "teams" } as const;

function requireStructureAdmin(actor: Actor, kind: Kind) {
  if (!hasPermission(actor, kind === "workspace" ? "workspaces.manage" : "structure.manage")) throw forbidden("Only an Admin can manage the organisation structure.");
}

async function assertActiveWorkspace(tx: Transaction, workspaceId: string) {
  const ws = await tx.get(col("workspaces").doc(workspaceId));
  if (!ws.exists || ws.data()?.status !== "active") throw new ApiError(422, "invalid_workspace", "Choose an active workspace.", { workspaceId: "Choose an active workspace" });
}

async function assertUniqueSlug(tx: Transaction, kind: Kind, slug: string, workspaceId: string | null, exceptId?: string) {
  let q = col(collectionOf[kind]).where("slug", "==", slug);
  if (workspaceId) q = q.where("workspaceId", "==", workspaceId);
  const snap = await tx.get(q.limit(2));
  if (snap.docs.some((d) => d.id !== exceptId)) throw new ApiError(409, "name_taken", `A ${kind} with this name already exists.`, { name: "This name is already used" });
}

export async function createResource(
  actor: Actor,
  kind: Kind,
  input: { name: string; description?: string; workspaceId?: string; workstreamIds?: string[] },
  requestId: string,
): Promise<string> {
  requireStructureAdmin(actor, kind);
  const ref = col(collectionOf[kind]).doc();
  const slug = slugify(input.name) || ref.id;
  await adminDb().runTransaction(async (tx) => {
    const linkRefs: DocumentReference[] = (input.workstreamIds ?? []).map((id) => col("workstreams").doc(id));
    const links = linkRefs.length ? await tx.getAll(...linkRefs) : [];
    if (kind !== "workspace") await assertActiveWorkspace(tx, input.workspaceId!);
    await assertUniqueSlug(tx, kind, slug, kind === "workspace" ? null : input.workspaceId!);
    for (const l of links) {
      if (!l.exists || l.data()?.status !== "active" || l.data()?.workspaceId !== input.workspaceId) throw new ApiError(422, "invalid_workstream", "Linked workstreams must be active and in the same workspace.");
    }
    tx.set(ref, {
      organizationId: serverEnv().ORGANIZATION_ID,
      ...(kind === "workspace" ? {} : { workspaceId: input.workspaceId }),
      name: input.name,
      slug,
      description: input.description ?? null,
      status: "active",
      createdBy: actor.uid,
      createdAt: now(),
      updatedAt: now(),
    });
    for (const l of links) {
      tx.set(col("workstreamTeams").doc(workstreamTeamId(l.id, ref.id)), {
        organizationId: serverEnv().ORGANIZATION_ID,
        workspaceId: input.workspaceId,
        workstreamId: l.id,
        teamId: ref.id,
        status: "active",
        createdBy: actor.uid,
        createdAt: now(),
      });
    }
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: `${kind}.created`,
      resourceType: kind,
      resourceId: ref.id,
      workspaceId: kind === "workspace" ? ref.id : input.workspaceId,
      after: { name: input.name, description: input.description ?? null, workstreamIds: input.workstreamIds ?? [] },
      requestId,
    });
  });
  return ref.id;
}

export async function updateResource(actor: Actor, kind: Kind, id: string, input: { name: string; description?: string }, requestId: string) {
  requireStructureAdmin(actor, kind);
  const ref = col(collectionOf[kind]).doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound();
    const before = snap.data()!;
    const slug = slugify(input.name) || id;
    await assertUniqueSlug(tx, kind, slug, kind === "workspace" ? null : before.workspaceId, id);
    tx.update(ref, { name: input.name, slug, description: input.description ?? null, updatedAt: now() });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: `${kind}.updated`,
      resourceType: kind,
      resourceId: id,
      workspaceId: kind === "workspace" ? id : before.workspaceId,
      before: { name: before.name, description: before.description ?? null },
      after: { name: input.name, description: input.description ?? null },
      requestId,
    });
  });
}

/** Archive keeps the document, its memberships and its history. Nothing is deleted. */
export async function setArchived(actor: Actor, kind: Kind, id: string, archived: boolean, requestId: string) {
  requireStructureAdmin(actor, kind);
  const ref = col(collectionOf[kind]).doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound();
    const before = snap.data()!;
    if (kind === "workspace" && archived) {
      const active = await tx.get(col("workspaces").where("organizationId", "==", serverEnv().ORGANIZATION_ID).where("status", "==", "active"));
      if (active.size <= 1) throw conflict("last_workspace", "This is the only active workspace and cannot be archived.");
    }
    if (kind !== "workspace" && !archived) await assertActiveWorkspace(tx, before.workspaceId);
    tx.update(ref, { status: archived ? "archived" : "active", archivedAt: archived ? now() : null, updatedAt: now() });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: `${kind}.${archived ? "archived" : "restored"}`,
      resourceType: kind,
      resourceId: id,
      workspaceId: kind === "workspace" ? id : before.workspaceId,
      before: { status: before.status },
      after: { status: archived ? "archived" : "active" },
      requestId,
    });
  });
}

export async function setTeamLink(actor: Actor, teamId: string, workstreamId: string, linked: boolean, requestId: string) {
  requireStructureAdmin(actor, "team");
  const ref = col("workstreamTeams").doc(workstreamTeamId(workstreamId, teamId));
  await adminDb().runTransaction(async (tx) => {
    const [team, ws, link] = await tx.getAll(col("teams").doc(teamId), col("workstreams").doc(workstreamId), ref);
    if (!team!.exists || !ws!.exists) throw notFound();
    if (team!.data()!.workspaceId !== ws!.data()!.workspaceId) throw new ApiError(422, "cross_workspace", "A team can only join workstreams in its own workspace.");
    if (linked && ws!.data()!.status !== "active") throw new ApiError(422, "archived", "That workstream is archived.");
    if (linked) {
      tx.set(ref, {
        organizationId: serverEnv().ORGANIZATION_ID,
        workspaceId: team!.data()!.workspaceId,
        workstreamId,
        teamId,
        status: "active",
        createdBy: actor.uid,
        createdAt: link!.exists ? link!.data()!.createdAt : now(),
        updatedAt: now(),
      });
    } else if (link!.exists) {
      tx.update(ref, { status: "inactive", updatedAt: now() });
    }
    writeAudit(tx, { actorUserId: actor.uid, action: linked ? "team.linked_to_workstream" : "team.unlinked_from_workstream", resourceType: "team", resourceId: teamId, workspaceId: team!.data()!.workspaceId, after: { workstreamId }, requestId });
  });
}

// ── Memberships ─────────────────────────────────────────────────────────

type ScopeKind = "team" | "workstream";
const membershipCol = (k: ScopeKind) => col(k === "team" ? "teamMemberships" : "workstreamMemberships");
const scopeCol = (k: ScopeKind) => col(k === "team" ? "teams" : "workstreams");
const eventFor = (k: ScopeKind): "USER_TEAM_ASSIGNED" | "USER_WORKSTREAM_ASSIGNED" => (k === "team" ? "USER_TEAM_ASSIGNED" : "USER_WORKSTREAM_ASSIGNED");

export async function assignMembership(actor: Actor, uid: string, input: { scopeKind: ScopeKind; scopeId: string; membershipType: MembershipType }, requestId: string) {
  if (!hasPermission(actor, "memberships.manage")) throw forbidden("Only an Admin can change team and workstream membership.");
  const ref = membershipCol(input.scopeKind).doc(membershipId(input.scopeId, uid));
  await adminDb().runTransaction(async (tx) => {
    const [userSnap, scopeSnap, existing] = await tx.getAll(col("users").doc(uid), scopeCol(input.scopeKind).doc(input.scopeId), ref);
    if (!userSnap!.exists) throw notFound("User not found.");
    if (!scopeSnap!.exists) throw notFound(`That ${input.scopeKind} does not exist.`);
    const user = userSnap!.data()!;
    const scope = scopeSnap!.data()!;
    if (user.status === "deactivated") throw conflict("user_deactivated", "Reactivate this account before assigning it.");
    if (scope.status !== "active") throw conflict("scope_archived", `This ${input.scopeKind} is archived.`);
    if (input.membershipType === "lead" && user.role === "member") {
      throw new ApiError(422, "role_required", "Only people with the Lead or Admin role can be assigned as a Lead. Change their role first.");
    }
    const prev = existing!.exists ? existing!.data()! : null;
    if (prev?.status === "active" && prev.membershipType === input.membershipType) throw conflict("already_assigned", "Already assigned.");
    tx.set(ref, {
      organizationId: serverEnv().ORGANIZATION_ID,
      workspaceId: scope.workspaceId,
      [input.scopeKind === "team" ? "teamId" : "workstreamId"]: input.scopeId,
      userId: uid,
      membershipType: input.membershipType,
      status: "active",
      assignedBy: actor.uid,
      assignedAt: now(),
      endedAt: null,
    });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: `${input.scopeKind}_membership.${prev?.status === "active" ? "changed" : "assigned"}`,
      resourceType: input.scopeKind,
      resourceId: input.scopeId,
      subjectUserIds: [uid],
      workspaceId: scope.workspaceId,
      before: prev ? { status: prev.status, membershipType: prev.membershipType } : undefined,
      after: { status: "active", membershipType: input.membershipType },
      requestId,
    });
    enqueueEvent(tx, {
      eventType: eventFor(input.scopeKind),
      actorUserId: actor.uid,
      resourceType: input.scopeKind,
      resourceId: input.scopeId,
      workspaceId: scope.workspaceId,
      payload: { userId: uid, scopeId: input.scopeId, change: "added", membershipType: input.membershipType },
    });
  });
}

export async function removeMembership(actor: Actor, uid: string, scopeKind: ScopeKind, scopeId: string, requestId: string) {
  if (!hasPermission(actor, "memberships.manage")) throw forbidden("Only an Admin can change team and workstream membership.");
  const ref = membershipCol(scopeKind).doc(membershipId(scopeId, uid));
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.status !== "active") throw notFound("No active assignment to remove.");
    const m = snap.data()!;
    // Membership history is retained: the record becomes inactive with an end date.
    tx.update(ref, { status: "inactive", endedAt: now() });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: `${scopeKind}_membership.removed`,
      resourceType: scopeKind,
      resourceId: scopeId,
      subjectUserIds: [uid],
      workspaceId: m.workspaceId,
      before: { status: "active", membershipType: m.membershipType },
      after: { status: "inactive" },
      requestId,
    });
    enqueueEvent(tx, { eventType: eventFor(scopeKind), actorUserId: actor.uid, resourceType: scopeKind, resourceId: scopeId, workspaceId: m.workspaceId, payload: { userId: uid, scopeId, change: "removed", membershipType: m.membershipType } });
  });
}

/** Moves a person between teams atomically, keeping their membership type. */
export async function transferTeam(actor: Actor, uid: string, fromTeamId: string, toTeamId: string, requestId: string) {
  if (!hasPermission(actor, "memberships.manage")) throw forbidden("Only an Admin can transfer team members.");
  if (fromTeamId === toTeamId) throw new ApiError(422, "same_team", "Choose a different team.");
  const fromRef = col("teamMemberships").doc(membershipId(fromTeamId, uid));
  const toRef = col("teamMemberships").doc(membershipId(toTeamId, uid));
  await adminDb().runTransaction(async (tx) => {
    const [from, to, toTeam] = await tx.getAll(fromRef, toRef, col("teams").doc(toTeamId));
    if (!from!.exists || from!.data()?.status !== "active") throw notFound("This person is not an active member of the source team.");
    if (!toTeam!.exists || toTeam!.data()?.status !== "active") throw conflict("scope_archived", "The destination team is archived or missing.");
    if (to!.exists && to!.data()?.status === "active") throw conflict("already_assigned", "This person is already in the destination team.");
    const type = from!.data()!.membershipType;
    tx.update(fromRef, { status: "inactive", endedAt: now() });
    tx.set(toRef, {
      organizationId: serverEnv().ORGANIZATION_ID,
      workspaceId: toTeam!.data()!.workspaceId,
      teamId: toTeamId,
      userId: uid,
      membershipType: type,
      status: "active",
      assignedBy: actor.uid,
      assignedAt: now(),
      endedAt: null,
    });
    writeAudit(tx, {
      actorUserId: actor.uid,
      action: "team_membership.transferred",
      resourceType: "team",
      resourceId: toTeamId,
      subjectUserIds: [uid],
      workspaceId: toTeam!.data()!.workspaceId,
      before: { teamId: fromTeamId },
      after: { teamId: toTeamId, membershipType: type },
      requestId,
    });
    enqueueEvent(tx, {
      eventType: "USER_TEAM_ASSIGNED",
      actorUserId: actor.uid,
      resourceType: "team",
      resourceId: toTeamId,
      workspaceId: toTeam!.data()!.workspaceId,
      payload: { userId: uid, scopeId: toTeamId, fromScopeId: fromTeamId, change: "transferred", membershipType: type },
    });
  });
}

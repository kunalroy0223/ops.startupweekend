import "server-only";
import type { Actor, Scope } from "@/domain/authz";
import { canManageAssignedScope, isAdmin } from "@/domain/authz";
import type {
  GovernancePolicy, GovernanceReview, ManagedEvent, ManagedResource, Programme,
  ProgrammeSession, ResourceAllocation,
} from "@/domain/types";
import { writeAudit } from "../audit";
import { canTransitionAllocation, canTransitionAsset, canTransitionEvent, canTransitionProgramme, canTransitionSession, canFitReservation, maximumConcurrentQuantity } from "@/domain/operational-modules";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { ApiError, forbidden, notFound } from "../http";
import { getScope } from "../scope";
import { assertActorInOrganization } from "./actor-access";
import { getUserDetail, listAudit } from "../queries";

const org = () => serverEnv().ORGANIZATION_ID;
const SCHEMA_VERSION = 1;

type ScopeTarget = { workstreamId?: string | null; teamId?: string | null };

async function workspaceScope(actor: Actor, workspaceId: string): Promise<Scope> {
  await assertActorInOrganization(actor, org());
  const workspace = await col("workspaces").doc(workspaceId).get();
  if (!workspace.exists || workspace.data()?.organizationId !== org() || workspace.data()?.status !== "active") {
    throw notFound("Workspace not found or inactive.");
  }
  const scope = isAdmin(actor) ? undefined : await getScope(actor.uid);
  if (scope && !scope.workspaceIds.has(workspaceId)) throw forbidden("This workspace is outside your assigned scope.");
  return scope ?? {
    workspaceIds: new Set([workspaceId]), leadWorkstreamIds: new Set(), leadTeamIds: new Set(),
    memberWorkstreamIds: new Set(), memberTeamIds: new Set(), teamIdsViaLedWorkstreams: new Set(),
  };
}

function assertManager(actor: Actor, scope: Scope, workspaceId: string, target: ScopeTarget) {
  if (isAdmin(actor)) return;
  if (actor.role !== "lead" || !canManageAssignedScope(actor, scope, workspaceId, target.teamId, target.workstreamId)) {
    throw forbidden("Only an Admin or a Lead assigned to this team/workstream can manage this record.");
  }
}


async function assertScopeReferences(actor: Actor, workspaceId: string, target: ScopeTarget) {
  if (target.workstreamId) {
    const stream = await col("workstreams").doc(target.workstreamId).get();
    if (!stream.exists || stream.data()?.organizationId !== org() || stream.data()?.workspaceId !== workspaceId || stream.data()?.status !== "active") {
      throw new ApiError(422, "invalid_workstream", "Choose an active workstream in this workspace.");
    }
  }
  if (target.teamId) {
    const team = await col("teams").doc(target.teamId).get();
    if (!team.exists || team.data()?.organizationId !== org() || team.data()?.workspaceId !== workspaceId || team.data()?.status !== "active") {
      throw new ApiError(422, "invalid_team", "Choose an active team in this workspace.");
    }
  }
  const scope = await workspaceScope(actor, workspaceId);
  assertManager(actor, scope, workspaceId, target);
}

function canSeeTarget(actor: Actor, scope: Scope, target: ScopeTarget) {
  if (isAdmin(actor)) return true;
  if (actor.role === "lead") {
    if (!target.teamId && !target.workstreamId) return true;
    return Boolean((target.teamId && (scope.leadTeamIds.has(target.teamId) || scope.teamIdsViaLedWorkstreams.has(target.teamId)))
      || (target.workstreamId && scope.leadWorkstreamIds.has(target.workstreamId)));
  }
  if (!target.teamId && !target.workstreamId) return true;
  return Boolean((target.teamId && scope.memberTeamIds.has(target.teamId)) || (target.workstreamId && scope.memberWorkstreamIds.has(target.workstreamId)));
}

async function assertActiveUserInWorkspace(userId: string, workspaceId: string) {
  const user = await col("users").doc(userId).get();
  if (!user.exists || user.data()?.organizationId !== org() || user.data()?.status !== "active") {
    throw new ApiError(422, "invalid_user", "Choose an active Inhub account.");
  }
  if (user.data()?.role !== "admin") {
    const scope = await getScope(userId);
    if (!scope.workspaceIds.has(workspaceId)) throw new ApiError(422, "user_outside_workspace", "The selected user is not assigned to this workspace.");
  }
}

async function assertUserInManagerScope(actor: Actor, workspaceId: string, userId: string) {
  await assertActiveUserInWorkspace(userId, workspaceId);
  if (isAdmin(actor) || userId === actor.uid) return;
  const detail = await getUserDetail(actor, userId);
  if (!detail || detail.user.status !== "active") {
    throw forbidden("You may only assign resources to active users who share your team or workstream scope.");
  }
  // getUserDetail applies the same scoped directory policy used elsewhere.
}

// ── Module 10: Events, programmes and run-of-show sessions ────────────────

export interface OperationsWorkspaceData {
  programmes: Programme[];
  events: ManagedEvent[];
  sessions: ProgrammeSession[];
}

export async function listOperationsWorkspace(actor: Actor, workspaceId: string): Promise<OperationsWorkspaceData> {
  const scope = await workspaceScope(actor, workspaceId);
  const [programmesSnap, eventsSnap, sessionsSnap] = await Promise.all([
    col("programmes").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("updatedAt", "desc").limit(100).get(),
    col("operationalEvents").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("startAt", "asc").limit(200).get(),
    col("programmeSessions").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("startAt", "asc").limit(300).get(),
  ]);
  const programmes = programmesSnap.docs.map((d) => fromDoc<Programme>(d)).filter((r) => r.status !== "archived" && canSeeTarget(actor, scope, r));
  const events = eventsSnap.docs.map((d) => fromDoc<ManagedEvent>(d)).filter((r) => r.status !== "archived" && canSeeTarget(actor, scope, r));
  const visibleProgrammeIds = new Set(programmes.map((r) => r.id));
  return {
    programmes,
    events,
    sessions: sessionsSnap.docs.map((d) => fromDoc<ProgrammeSession>(d)).filter((r) => r.status !== "cancelled" && visibleProgrammeIds.has(r.programmeId)),
  };
}

export async function createProgramme(actor: Actor, input: {
  workspaceId: string; name: string; programmeType: string; description?: string; ownerUserId?: string;
  workstreamId?: string; teamId?: string; startAt?: string; endAt?: string;
}, requestId: string) {
  await assertScopeReferences(actor, input.workspaceId, input);
  const ownerUserId = isAdmin(actor) ? input.ownerUserId ?? actor.uid : actor.uid;
  await assertActiveUserInWorkspace(ownerUserId, input.workspaceId);
  if (input.startAt && input.endAt && Date.parse(input.endAt) <= Date.parse(input.startAt)) throw new ApiError(422, "invalid_date_range", "Programme end must be after its start.");
  const ref = col("programmes").doc();
  const timestamp = now();
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, name: input.name.trim(), programmeType: input.programmeType.trim(),
    description: input.description?.trim() || null, ownerUserId, workstreamId: input.workstreamId ?? null,
    teamId: input.teamId ?? null, startAt: input.startAt ?? null, endAt: input.endAt ?? null,
    status: "draft" as const, createdBy: actor.uid, updatedBy: actor.uid,
    createdAt: timestamp, updatedAt: timestamp, schemaVersion: SCHEMA_VERSION,
  };
  const batch = adminDb().batch();
  batch.create(ref, data);
  writeAudit(batch, { actorUserId: actor.uid, action: "programme.created", resourceType: "programme", resourceId: ref.id, workspaceId: input.workspaceId, subjectUserIds: [ownerUserId], after: { name: data.name, programmeType: data.programmeType }, requestId });
  await batch.commit();
  return ref.id;
}

export async function updateProgramme(actor: Actor, id: string, patch: Partial<Pick<Programme, "name" | "programmeType" | "startAt" | "endAt" | "status">> & { description?: string | null }, requestId: string) {
  const ref = col("programmes").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Programme not found.");
  const before = fromDoc<Programme>(snap);
  const scope = await workspaceScope(actor, before.workspaceId);
  assertManager(actor, scope, before.workspaceId, before);
  if (patch.status && !canTransitionProgramme(before.status, patch.status)) throw new ApiError(409, "invalid_programme_transition", `Cannot move a programme from ${before.status} to ${patch.status}.`);
  const nextStart = patch.startAt ?? before.startAt;
  const nextEnd = patch.endAt ?? before.endAt;
  if (nextStart && nextEnd && Date.parse(nextEnd) <= Date.parse(nextStart)) throw new ApiError(422, "invalid_date_range", "Programme end must be after its start.");
  const update: Record<string, unknown> = { ...patch, updatedBy: actor.uid, updatedAt: now() };
  if (patch.status === "archived") update.archivedAt = now();
  const batch = adminDb().batch(); batch.update(ref, update);
  writeAudit(batch, { actorUserId: actor.uid, action: "programme.updated", resourceType: "programme", resourceId: id, workspaceId: before.workspaceId, before: { status: before.status, name: before.name }, after: { status: patch.status ?? before.status, name: patch.name ?? before.name }, requestId });
  await batch.commit();
}

export async function createOperationalEvent(actor: Actor, input: {
  workspaceId: string; programmeId?: string; title: string; eventType: ManagedEvent["eventType"]; description?: string;
  startAt: string; endAt: string; venue?: string; meetingUrl?: string; ownerUserId?: string;
  workstreamId?: string; teamId?: string; operationsNotes?: string;
}, requestId: string) {
  await assertScopeReferences(actor, input.workspaceId, input);
  if (Date.parse(input.endAt) <= Date.parse(input.startAt)) throw new ApiError(422, "invalid_date_range", "Event end must be after its start.");
  if (input.programmeId) {
    const programmeSnap = await col("programmes").doc(input.programmeId).get();
    if (!programmeSnap.exists || programmeSnap.data()?.organizationId !== org() || programmeSnap.data()?.workspaceId !== input.workspaceId || programmeSnap.data()?.status === "archived") throw new ApiError(422, "invalid_programme", "Choose an active programme in this workspace.");
    const scope = await workspaceScope(actor, input.workspaceId);
    if (!canSeeTarget(actor, scope, fromDoc<Programme>(programmeSnap))) throw forbidden("The selected programme is outside your assigned scope.");
  }
  const ownerUserId = isAdmin(actor) ? input.ownerUserId ?? actor.uid : actor.uid;
  await assertActiveUserInWorkspace(ownerUserId, input.workspaceId);
  const ref = col("operationalEvents").doc(); const timestamp = now();
  const organization = await col("organizations").doc(org()).get();
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, programmeId: input.programmeId ?? null, title: input.title.trim(), eventType: input.eventType,
    description: input.description?.trim() || null, startAt: input.startAt, endAt: input.endAt,
    timeZone: organization.data()?.timezone ?? "Asia/Kolkata", venue: input.venue?.trim() || null,
    meetingUrl: input.meetingUrl ?? null, ownerUserId, workstreamId: input.workstreamId ?? null, teamId: input.teamId ?? null,
    status: "planning" as const, operationsNotes: input.operationsNotes?.trim() || null,
    createdBy: actor.uid, updatedBy: actor.uid, createdAt: timestamp, updatedAt: timestamp, schemaVersion: SCHEMA_VERSION,
  };
  const batch = adminDb().batch(); batch.create(ref, data);
  writeAudit(batch, { actorUserId: actor.uid, action: "operational_event.created", resourceType: "operationalEvent", resourceId: ref.id, workspaceId: input.workspaceId, subjectUserIds: [ownerUserId], after: { title: data.title, eventType: data.eventType, startAt: data.startAt }, requestId });
  await batch.commit(); return ref.id;
}

export async function updateOperationalEvent(actor: Actor, id: string, patch: Partial<Pick<ManagedEvent, "title" | "startAt" | "endAt" | "status">> & { description?: string | null; venue?: string | null; meetingUrl?: string | null; operationsNotes?: string | null }, requestId: string) {
  const ref = col("operationalEvents").doc(id); const snap = await ref.get();
  if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Event not found.");
  const before = fromDoc<ManagedEvent>(snap); const scope = await workspaceScope(actor, before.workspaceId);
  assertManager(actor, scope, before.workspaceId, before);
  if (patch.status && !canTransitionEvent(before.status, patch.status)) throw new ApiError(409, "invalid_event_transition", `Cannot move an event from ${before.status} to ${patch.status}.`);
  const startAt = patch.startAt ?? before.startAt; const endAt = patch.endAt ?? before.endAt;
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new ApiError(422, "invalid_date_range", "Event end must be after its start.");
  const batch = adminDb().batch(); batch.update(ref, { ...patch, updatedBy: actor.uid, updatedAt: now() });
  writeAudit(batch, { actorUserId: actor.uid, action: "operational_event.updated", resourceType: "operationalEvent", resourceId: id, workspaceId: before.workspaceId, before: { status: before.status, title: before.title }, after: { status: patch.status ?? before.status, title: patch.title ?? before.title }, requestId });
  await batch.commit();
}

export async function createProgrammeSession(actor: Actor, input: {
  workspaceId: string; programmeId: string; eventId?: string; title: string; description?: string;
  startAt: string; endAt: string; facilitator?: string; location?: string; sortOrder: number;
}, requestId: string) {
  const scope = await workspaceScope(actor, input.workspaceId);
  const programmeSnap = await col("programmes").doc(input.programmeId).get();
  if (!programmeSnap.exists || programmeSnap.data()?.organizationId !== org() || programmeSnap.data()?.workspaceId !== input.workspaceId) throw new ApiError(422, "invalid_programme", "Choose a programme in this workspace.");
  const programme = fromDoc<Programme>(programmeSnap);
  assertManager(actor, scope, input.workspaceId, programme);
  if (input.eventId) {
    const eventSnap = await col("operationalEvents").doc(input.eventId).get();
    if (!eventSnap.exists || eventSnap.data()?.organizationId !== org() || eventSnap.data()?.workspaceId !== input.workspaceId) throw new ApiError(422, "invalid_event", "Choose an event in this workspace.");
    const eventData = eventSnap.data();
    if (!canSeeTarget(actor, scope, { teamId: eventData?.teamId ?? null, workstreamId: eventData?.workstreamId ?? null })) {
      throw forbidden("The selected event is outside your assigned scope.");
    }
    const eventProgrammeId = eventData?.programmeId;
    if (eventProgrammeId && eventProgrammeId !== input.programmeId) throw new ApiError(422, "event_programme_mismatch", "The selected event is linked to a different programme.");
  }
  if (Date.parse(input.endAt) <= Date.parse(input.startAt)) throw new ApiError(422, "invalid_date_range", "Session end must be after its start.");
  const ref = col("programmeSessions").doc(); const timestamp = now();
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, programmeId: input.programmeId, eventId: input.eventId ?? null,
    title: input.title.trim(), description: input.description?.trim() || null, startAt: input.startAt, endAt: input.endAt,
    facilitator: input.facilitator?.trim() || null, location: input.location?.trim() || null,
    status: "planned" as const, sortOrder: input.sortOrder, createdBy: actor.uid, updatedBy: actor.uid, createdAt: timestamp, updatedAt: timestamp,
  };
  const batch = adminDb().batch(); batch.create(ref, data);
  writeAudit(batch, { actorUserId: actor.uid, action: "programme_session.created", resourceType: "programmeSession", resourceId: ref.id, workspaceId: input.workspaceId, after: { programmeId: input.programmeId, title: data.title, startAt: data.startAt }, requestId });
  await batch.commit(); return ref.id;
}

export async function updateProgrammeSession(actor: Actor, id: string, patch: Partial<Pick<ProgrammeSession, "title" | "startAt" | "endAt" | "status" | "sortOrder">> & { description?: string | null; facilitator?: string | null; location?: string | null }, requestId: string) {
  const ref = col("programmeSessions").doc(id); const snap = await ref.get();
  if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Programme session not found.");
  const before = fromDoc<ProgrammeSession>(snap); const scope = await workspaceScope(actor, before.workspaceId);
  const programmeSnap = await col("programmes").doc(before.programmeId).get();
  if (!programmeSnap.exists || programmeSnap.data()?.organizationId !== org() || programmeSnap.data()?.workspaceId !== before.workspaceId) throw new ApiError(409, "orphaned_programme_session", "The linked programme is missing or no longer belongs to this workspace.");
  const target = fromDoc<Programme>(programmeSnap);
  assertManager(actor, scope, before.workspaceId, target);
  if (patch.status && !canTransitionSession(before.status, patch.status)) throw new ApiError(409, "invalid_session_transition", `Cannot move a session from ${before.status} to ${patch.status}.`);
  const startAt = patch.startAt ?? before.startAt; const endAt = patch.endAt ?? before.endAt;
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new ApiError(422, "invalid_date_range", "Session end must be after its start.");
  const batch = adminDb().batch(); batch.update(ref, { ...patch, updatedBy: actor.uid, updatedAt: now() });
  writeAudit(batch, { actorUserId: actor.uid, action: "programme_session.updated", resourceType: "programmeSession", resourceId: id, workspaceId: before.workspaceId, before: { status: before.status, title: before.title }, after: { status: patch.status ?? before.status, title: patch.title ?? before.title }, requestId });
  await batch.commit();
}

// ── Module 11: Resources, inventory and allocation lifecycle ─────────────

export interface ResourceWorkspaceData { resources: ManagedResource[]; allocations: ResourceAllocation[] }

export async function listResourceWorkspace(actor: Actor, workspaceId: string): Promise<ResourceWorkspaceData> {
  const scope = await workspaceScope(actor, workspaceId);
  const [resourceSnap, allocationSnap] = await Promise.all([
    col("managedResources").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("updatedAt", "desc").limit(250).get(),
    col("resourceAllocations").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("startAt", "desc").limit(300).get(),
  ]);
  const resources = resourceSnap.docs.map((d) => fromDoc<ManagedResource>(d)).filter((r) => r.status !== "archived" && canSeeTarget(actor, scope, r));
  const visibleResourceIds = new Set(resources.map((r) => r.id));
  const allocations = allocationSnap.docs.map((d) => fromDoc<ResourceAllocation>(d)).filter((a) => visibleResourceIds.has(a.resourceId)
    && (isAdmin(actor) || actor.role === "lead" || a.requestedByUserId === actor.uid || a.allocatedToUserId === actor.uid));
  return { resources, allocations };
}

export async function createManagedResource(actor: Actor, input: {
  workspaceId: string; kind: ManagedResource["kind"]; name: string; category: string; description?: string;
  inventoryCode?: string; serialNumber?: string; totalQuantity: number; location?: string; custodianUserId?: string;
  condition: ManagedResource["condition"]; workstreamId?: string; teamId?: string; notes?: string;
}, requestId: string) {
  await assertScopeReferences(actor, input.workspaceId, input);
  if (input.custodianUserId) await assertUserInManagerScope(actor, input.workspaceId, input.custodianUserId);
  const ref = col("managedResources").doc(); const timestamp = now();
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, kind: input.kind, name: input.name.trim(), category: input.category.trim(),
    description: input.description?.trim() || null, inventoryCode: input.inventoryCode?.trim() || null,
    serialNumber: input.serialNumber?.trim() || null, totalQuantity: input.totalQuantity,
    location: input.location?.trim() || null, custodianUserId: input.custodianUserId ?? null,
    condition: input.condition, status: input.condition === "needs_repair" ? "maintenance" as const : "available" as const, allocationRevision: 0,
    workstreamId: input.workstreamId ?? null, teamId: input.teamId ?? null, notes: input.notes?.trim() || null,
    createdBy: actor.uid, updatedBy: actor.uid, createdAt: timestamp, updatedAt: timestamp, schemaVersion: SCHEMA_VERSION,
  };
  const batch = adminDb().batch(); batch.create(ref, data);
  writeAudit(batch, { actorUserId: actor.uid, action: "resource.created", resourceType: "managedResource", resourceId: ref.id, workspaceId: input.workspaceId, after: { name: data.name, kind: data.kind, totalQuantity: data.totalQuantity }, requestId });
  await batch.commit(); return ref.id;
}

export async function updateManagedResource(actor: Actor, id: string, patch: Partial<Pick<ManagedResource, "name" | "category" | "totalQuantity" | "condition" | "status">> & { description?: string | null; inventoryCode?: string | null; serialNumber?: string | null; location?: string | null; custodianUserId?: string | null; notes?: string | null }, requestId: string) {
  const ref = col("managedResources").doc(id);
  const initial = await ref.get();
  if (!initial.exists || initial.data()?.organizationId !== org()) throw notFound("Resource not found.");
  const before = fromDoc<ManagedResource>(initial);
  const scope = await workspaceScope(actor, before.workspaceId);
  assertManager(actor, scope, before.workspaceId, before);
  if (patch.custodianUserId) await assertUserInManagerScope(actor, before.workspaceId, patch.custodianUserId);

  await adminDb().runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || fresh.data()?.organizationId !== org()) throw notFound("Resource not found.");
    const current = fromDoc<ManagedResource>(fresh);
    assertManager(actor, scope, current.workspaceId, current);

    const nextCondition = patch.condition ?? current.condition;
    let nextStatus = patch.status ?? current.status;
    if (nextCondition === "needs_repair" && nextStatus === "available") {
      if (patch.status === "available") throw new ApiError(409, "resource_needs_repair", "A resource marked as needing repair cannot be made available.");
      nextStatus = "maintenance";
    }
    if (patch.status && patch.status !== current.status && !canTransitionAsset(current.status, patch.status)) {
      throw new ApiError(409, "invalid_resource_transition", `Cannot move a resource from ${current.status} to ${patch.status}.`);
    }

    const activeQuery = col("resourceAllocations").where("organizationId", "==", org()).where("resourceId", "==", id).where("status", "in", ["approved", "checked_out"]);
    const activeSnap = await tx.get(activeQuery);
    const active = activeSnap.docs.map((doc) => fromDoc<ResourceAllocation>(doc));
    if (nextStatus !== current.status && nextStatus !== "available" && active.length > 0) {
      throw new ApiError(409, "resource_allocations_open", "Return or cancel active allocations before changing this resource to maintenance, retired or archived.");
    }
    const nextQuantity = patch.totalQuantity ?? current.totalQuantity;
    const occupancy = active.map((allocation) => ({
      startAt: allocation.status === "checked_out" && allocation.checkedOutAt
        && Date.parse(allocation.checkedOutAt) < Date.parse(allocation.startAt) ? allocation.checkedOutAt : allocation.startAt,
      endAt: allocation.status === "checked_out" ? "9999-12-31T23:59:59.999Z" : allocation.endAt,
      quantity: allocation.quantity,
    }));
    if (maximumConcurrentQuantity(occupancy) > nextQuantity) {
      throw new ApiError(409, "resource_quantity_in_use", "Quantity cannot be reduced below the peak concurrent approved or checked-out allocation.");
    }

    const update: Record<string, unknown> = { ...patch, condition: nextCondition, status: nextStatus, allocationRevision: (current.allocationRevision ?? 0) + 1, updatedBy: actor.uid, updatedAt: now() };
    tx.update(ref, update);
    writeAudit(tx, { actorUserId: actor.uid, action: "resource.updated", resourceType: "managedResource", resourceId: id, workspaceId: current.workspaceId, before: { status: current.status, totalQuantity: current.totalQuantity, condition: current.condition }, after: { status: nextStatus, totalQuantity: nextQuantity, condition: nextCondition }, requestId });
  });
}

export async function createResourceAllocation(actor: Actor, input: {
  workspaceId: string; resourceId: string; quantity: number; allocatedToUserId?: string; purpose: string;
  startAt: string; endAt: string; linkedEventId?: string;
}, requestId: string) {
  const scope = await workspaceScope(actor, input.workspaceId);
  if (Date.parse(input.endAt) <= Date.parse(input.startAt)) throw new ApiError(422, "invalid_date_range", "Allocation end must be after its start.");
  const resourceSnap = await col("managedResources").doc(input.resourceId).get();
  if (!resourceSnap.exists || resourceSnap.data()?.organizationId !== org() || resourceSnap.data()?.workspaceId !== input.workspaceId) throw notFound("Resource not found.");
  const resource = fromDoc<ManagedResource>(resourceSnap);
  if (!canSeeTarget(actor, scope, resource)) throw notFound("Resource not found.");
  if (resource.status !== "available") throw new ApiError(409, "resource_unavailable", "This resource is not currently available for allocation.");
  const allocatedToUserId = isAdmin(actor) || actor.role === "lead" ? input.allocatedToUserId ?? actor.uid : actor.uid;
  await assertUserInManagerScope(actor, input.workspaceId, allocatedToUserId);
  if (input.linkedEventId) {
    const event = await col("operationalEvents").doc(input.linkedEventId).get();
    if (!event.exists || event.data()?.organizationId !== org() || event.data()?.workspaceId !== input.workspaceId) throw new ApiError(422, "invalid_event", "Choose an event in this workspace.");
    if (!canSeeTarget(actor, scope, { teamId: event.data()?.teamId ?? null, workstreamId: event.data()?.workstreamId ?? null })) throw new ApiError(422, "event_outside_scope", "Choose an event within your assigned team or workstream scope.");
  }
  const ref = col("resourceAllocations").doc(); const timestamp = now();
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, resourceId: input.resourceId, quantity: input.quantity,
    requestedByUserId: actor.uid, allocatedToUserId, purpose: input.purpose.trim(), startAt: input.startAt, endAt: input.endAt,
    linkedEventId: input.linkedEventId ?? null, status: "requested" as const,
    createdAt: timestamp, updatedAt: timestamp,
  };
  const batch = adminDb().batch(); batch.create(ref, data);
  writeAudit(batch, { actorUserId: actor.uid, action: "resource_allocation.requested", resourceType: "resourceAllocation", resourceId: ref.id, workspaceId: input.workspaceId, subjectUserIds: [allocatedToUserId], after: { resourceId: input.resourceId, quantity: input.quantity, startAt: input.startAt, endAt: input.endAt }, requestId });
  await batch.commit(); return ref.id;
}

export async function updateResourceAllocation(actor: Actor, id: string, nextStatus: ResourceAllocation["status"], decisionNote: string | undefined, requestId: string) {
  const ref = col("resourceAllocations").doc(id);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Resource allocation not found.");
    const before = fromDoc<ResourceAllocation>(snap);
    const scope = await workspaceScope(actor, before.workspaceId);
    const resourceRef = col("managedResources").doc(before.resourceId);
    const resourceSnap = await tx.get(resourceRef);
    if (!resourceSnap.exists || resourceSnap.data()?.organizationId !== org()) throw notFound("Resource not found.");
    const resource = fromDoc<ManagedResource>(resourceSnap);
    const manager = isAdmin(actor) || (actor.role === "lead" && canManageAssignedScope(actor, scope, before.workspaceId, resource.teamId, resource.workstreamId));
    const requesterMayCancel = actor.uid === before.requestedByUserId && ["requested", "approved"].includes(before.status) && nextStatus === "cancelled";
    if (!manager && !requesterMayCancel) {
      throw forbidden("Only an authorised Lead/Admin can process this allocation. Requesters may cancel pending or approved allocations before checkout.");
    }
    if (!canTransitionAllocation(before.status, nextStatus)) throw new ApiError(409, "invalid_allocation_transition", `Cannot move an allocation from ${before.status} to ${nextStatus}.`);
    if (nextStatus === "approved") {
      if (resource.status !== "available") throw new ApiError(409, "resource_unavailable", "This resource is no longer available.");
      await assertActiveUserInWorkspace(before.allocatedToUserId, before.workspaceId);
      const query = col("resourceAllocations").where("organizationId", "==", org()).where("resourceId", "==", before.resourceId).where("status", "in", ["approved", "checked_out"]);
      const allocationSnaps = await tx.get(query);
      const activeAllocations = allocationSnaps.docs.map((d) => fromDoc<ResourceAllocation>(d)).filter((a) => a.id !== id);
      const fits = canFitReservation(resource.totalQuantity, before, activeAllocations.map((allocation) => ({
        startAt: allocation.startAt, endAt: allocation.endAt, quantity: allocation.quantity,
        checkedOut: allocation.status === "checked_out", checkedOutAt: allocation.checkedOutAt,
      })));
      if (!fits) throw new ApiError(409, "resource_capacity_exceeded", "The requested quantity overlaps existing approved allocations and exceeds available capacity, or an existing allocation has invalid timing data.");
      // Every approval and resource capacity edit writes this same document.
      // Firestore retries a transaction on contention, preventing concurrent over-allocation.
      tx.update(resourceRef, { allocationRevision: (resource.allocationRevision ?? 0) + 1, updatedAt: now() });
    }
    const patch: Record<string, unknown> = { status: nextStatus, decisionNote: decisionNote?.trim() || null, updatedAt: now() };
    if (nextStatus === "approved") { patch.approvedByUserId = actor.uid; patch.approvedAt = now(); }
    if (nextStatus === "checked_out") patch.checkedOutAt = now();
    if (nextStatus === "returned") patch.returnedAt = now();
    tx.update(ref, patch);
    writeAudit(tx, { actorUserId: actor.uid, action: `resource_allocation.${nextStatus}`, resourceType: "resourceAllocation", resourceId: id, workspaceId: before.workspaceId, subjectUserIds: [before.requestedByUserId, before.allocatedToUserId], before: { status: before.status }, after: { status: nextStatus, decisionNote: decisionNote ?? null }, requestId });
  });
}

// ── Module 12: Administration, audit and governance ───────────────────────

export interface GovernanceWorkspaceData {
  audit: Awaited<ReturnType<typeof listAudit>>["rows"];
  policies: GovernancePolicy[];
  reviews: GovernanceReview[];
}

function requireGovernanceAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw forbidden("Administration, Audit & Governance is restricted to Admins.");
}

export async function listGovernanceWorkspace(actor: Actor): Promise<GovernanceWorkspaceData> {
  requireGovernanceAdmin(actor);
  await assertActorInOrganization(actor, org());
  const [audit, policiesSnap, reviewsSnap] = await Promise.all([
    listAudit(actor, { limit: 100 }),
    col("governancePolicies").where("organizationId", "==", org()).orderBy("updatedAt", "desc").limit(100).get(),
    col("governanceReviews").where("organizationId", "==", org()).orderBy("createdAt", "desc").limit(100).get(),
  ]);
  const policies = policiesSnap.docs.map((d) => {
    const policy = fromDoc<GovernancePolicy>(d);
    return policy.status === "active" && policy.nextReviewAt && Date.parse(policy.nextReviewAt) <= Date.now()
      ? { ...policy, status: "review_due" as const }
      : policy;
  });
  return { audit: audit.rows, policies, reviews: reviewsSnap.docs.map((d) => fromDoc<GovernanceReview>(d)) };
}

export async function createGovernancePolicy(actor: Actor, input: {
  area: GovernancePolicy["area"]; title: string; description?: string; retentionDays?: number;
  disposition: GovernancePolicy["disposition"]; legalHold: boolean; reviewIntervalDays: number;
  nextReviewAt?: string; ownerUserId: string;
}, requestId: string) {
  requireGovernanceAdmin(actor); await assertActorInOrganization(actor, org());
  const owner = await col("users").doc(input.ownerUserId).get();
  if (!owner.exists || owner.data()?.organizationId !== org() || owner.data()?.status !== "active") throw new ApiError(422, "invalid_policy_owner", "Choose an active Inhub account as policy owner.");
  const ref = col("governancePolicies").doc(); const timestamp = now();
  const data = {
    organizationId: org(), area: input.area, title: input.title.trim(), description: input.description?.trim() || null,
    retentionDays: input.retentionDays ?? null, disposition: input.disposition, legalHold: input.legalHold,
    reviewIntervalDays: input.reviewIntervalDays, nextReviewAt: input.nextReviewAt ?? null, ownerUserId: input.ownerUserId,
    status: "active" as const, createdBy: actor.uid, updatedBy: actor.uid, createdAt: timestamp, updatedAt: timestamp, schemaVersion: SCHEMA_VERSION,
  };
  const batch = adminDb().batch(); batch.create(ref, data);
  writeAudit(batch, { actorUserId: actor.uid, action: "governance_policy.created", resourceType: "governancePolicy", resourceId: ref.id, subjectUserIds: [input.ownerUserId], after: { area: data.area, title: data.title, disposition: data.disposition, retentionDays: data.retentionDays }, requestId });
  await batch.commit(); return ref.id;
}

export async function updateGovernancePolicy(actor: Actor, id: string, patch: Partial<Pick<GovernancePolicy, "title" | "disposition" | "legalHold" | "reviewIntervalDays" | "ownerUserId" | "status">> & { description?: string | null; retentionDays?: number | null; nextReviewAt?: string | null }, requestId: string) {
  requireGovernanceAdmin(actor); await assertActorInOrganization(actor, org());
  const ref = col("governancePolicies").doc(id); const snap = await ref.get();
  if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Governance policy not found.");
  const before = fromDoc<GovernancePolicy>(snap);
  if (patch.ownerUserId) {
    const owner = await col("users").doc(patch.ownerUserId).get();
    if (!owner.exists || owner.data()?.organizationId !== org() || owner.data()?.status !== "active") throw new ApiError(422, "invalid_policy_owner", "Choose an active Inhub account as policy owner.");
  }
  const batch = adminDb().batch(); batch.update(ref, { ...patch, updatedBy: actor.uid, updatedAt: now() });
  writeAudit(batch, { actorUserId: actor.uid, action: "governance_policy.updated", resourceType: "governancePolicy", resourceId: id, before: { disposition: before.disposition, retentionDays: before.retentionDays, legalHold: before.legalHold, status: before.status }, after: patch as Record<string, unknown>, requestId });
  await batch.commit();
}

export async function createGovernanceReview(actor: Actor, input: {
  policyId: string; decision: GovernanceReview["decision"]; reason: string; recordReference?: string;
}, requestId: string) {
  requireGovernanceAdmin(actor); await assertActorInOrganization(actor, org());
  const policyRef = col("governancePolicies").doc(input.policyId);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(policyRef);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("Governance policy not found.");
    const policy = fromDoc<GovernancePolicy>(snap);
    const reviewRef = col("governanceReviews").doc();
    tx.create(reviewRef, {
      organizationId: org(), policyId: policy.id, area: policy.area, decision: input.decision,
      reason: input.reason.trim(), recordReference: input.recordReference?.trim() || null,
      actorUserId: actor.uid, createdAt: now(),
    });
    const nextReviewAt = new Date(Date.now() + policy.reviewIntervalDays * 86_400_000).toISOString();
    tx.update(policyRef, { nextReviewAt, status: "active", legalHold: input.decision === "legal_hold" ? true : policy.legalHold, updatedBy: actor.uid, updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "governance_review.recorded", resourceType: "governanceReview", resourceId: reviewRef.id, after: { policyId: policy.id, area: policy.area, decision: input.decision }, requestId });
  });
}

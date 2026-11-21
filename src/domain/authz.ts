/**
 * Central authorization rules. Pure functions only: no I/O, so they are unit
 * tested directly and shared by route handlers, server components and the
 * navigation builder. Firestore Security Rules mirror these (firestore.rules).
 *
 * Model: global role + resource scope + action. Default deny.
 * See docs/rbac-matrix.md.
 */
import type { Role, UserStatus } from "./types";

export interface Actor {
  uid: string;
  organizationId: string;
  role: Role;
  status: UserStatus;
  email: string;
  displayName: string;
}

/** Authoritative scope, loaded from active membership documents on every request. */
export interface Scope {
  workspaceIds: ReadonlySet<string>;
  leadWorkstreamIds: ReadonlySet<string>;
  leadTeamIds: ReadonlySet<string>;
  memberWorkstreamIds: ReadonlySet<string>;
  memberTeamIds: ReadonlySet<string>;
  /** Teams linked (workstreamTeams, active) to a workstream this user leads. */
  teamIdsViaLedWorkstreams: ReadonlySet<string>;
}

export const EMPTY_SCOPE: Scope = {
  workspaceIds: new Set(),
  leadWorkstreamIds: new Set(),
  leadTeamIds: new Set(),
  memberWorkstreamIds: new Set(),
  memberTeamIds: new Set(),
  teamIdsViaLedWorkstreams: new Set(),
};

/** Global (non-scoped) permissions. Only Admin holds administrative ones in v1. */
export type Permission =
  | "users.view_all"
  | "users.invite"
  | "users.edit"
  | "users.change_role"
  | "users.change_status"
  | "memberships.manage"
  | "workspaces.manage"
  | "structure.manage"
  | "settings.manage"
  | "audit.view_all"
  | "notifications.administer"
  | "automation.rules.view"
  | "automation.rules.manage"
  | "automation.runs.view_all"
  | "automation.runs.view_scoped"
  | "automation.runs.retry"
  | "crm.administer";

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    "users.view_all",
    "users.invite",
    "users.edit",
    "users.change_role",
    "users.change_status",
    "memberships.manage",
    "workspaces.manage",
    "structure.manage",
    "settings.manage",
    "audit.view_all",
    "notifications.administer",
    "automation.rules.view",
    "automation.rules.manage",
    "automation.runs.view_all",
    "automation.runs.view_scoped",
    "automation.runs.retry",
    "crm.administer",
  ]),
  // RBAC §4 default policy: delegated administration is NOT inferred from Lead.
  lead: new Set<Permission>(),
  member: new Set<Permission>(),
};

export function isActive(actor: Pick<Actor, "status"> | null | undefined): boolean {
  return actor?.status === "active";
}

/**
 * Confirms that the request actor and the persisted user profile still describe
 * an active user in the deployment's organisation. The profile is read by the
 * server service layer; request payloads are never an authority for this data.
 */
export function canUseOrganization(
  actor: Actor | null | undefined,
  organizationId: string,
  persistedProfile: { organizationId?: string; role?: Role; status?: UserStatus } | null | undefined,
): boolean {
  return Boolean(
    actor &&
    persistedProfile &&
    isActive(actor) &&
    actor.organizationId === organizationId &&
    persistedProfile.organizationId === organizationId &&
    persistedProfile.status === "active" &&
    persistedProfile.role === actor.role
  );
}

export function hasPermission(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor || !isActive(actor)) return false;
  return ROLE_PERMISSIONS[actor.role].has(permission);
}

export function isAdmin(actor: Actor | null | undefined): boolean {
  return !!actor && isActive(actor) && actor.role === "admin";
}

// ── Scoped visibility ────────────────────────────────────────────────────

export function canViewWorkspace(actor: Actor, scope: Scope, workspaceId: string): boolean {
  if (!isActive(actor)) return false;
  if (actor.role === "admin") return true;
  return scope.workspaceIds.has(workspaceId);
}

export function canViewWorkstream(actor: Actor, scope: Scope, workstreamId: string): boolean {
  if (!isActive(actor)) return false;
  if (actor.role === "admin") return true;
  return scope.leadWorkstreamIds.has(workstreamId) || scope.memberWorkstreamIds.has(workstreamId);
}

/**
 * A team is visible to a Lead assigned to it or to a workstream it is linked
 * to, and to a Team Member with an active membership in it.
 */
export function canViewTeam(actor: Actor, scope: Scope, teamId: string, linkedWorkstreamIds: readonly string[] = []): boolean {
  if (!isActive(actor)) return false;
  if (actor.role === "admin") return true;
  if (scope.memberTeamIds.has(teamId) || scope.leadTeamIds.has(teamId)) return true;
  if (actor.role === "lead") {
    if (scope.teamIdsViaLedWorkstreams.has(teamId)) return true;
    return linkedWorkstreamIds.some((id) => scope.leadWorkstreamIds.has(id));
  }
  return false;
}

/** Lead "manage assigned teams" = view roster and operate team work (Module 2+). Membership edits stay Admin-only. */
export function canLeadTeam(actor: Actor, scope: Scope, teamId: string): boolean {
  if (!isActive(actor)) return false;
  if (actor.role === "admin") return true;
  return actor.role === "lead" && (scope.leadTeamIds.has(teamId) || scope.teamIdsViaLedWorkstreams.has(teamId));
}

export interface TargetMemberships {
  teamIds: readonly string[];
  workstreamIds: readonly string[];
}

/**
 * Directory visibility. Admin sees everyone. A Lead sees people who share any
 * team or workstream in the Lead's scope. A Team Member sees people who share
 * one of the member's active teams.
 */
export function canViewUser(actor: Actor, scope: Scope, targetUid: string, target: TargetMemberships): boolean {
  if (!isActive(actor)) return false;
  if (actor.uid === targetUid) return true;
  if (actor.role === "admin") return true;
  if (actor.role === "lead") {
    const teams = new Set([...scope.leadTeamIds, ...scope.memberTeamIds, ...scope.teamIdsViaLedWorkstreams]);
    const streams = new Set([...scope.leadWorkstreamIds, ...scope.memberWorkstreamIds]);
    return target.teamIds.some((t) => teams.has(t)) || target.workstreamIds.some((w) => streams.has(w));
  }
  return target.teamIds.some((t) => scope.memberTeamIds.has(t));
}

/** Cross-scope rule (RBAC §2.8): the actor must be authorised for every affected scope. */
export function canActOnAll<T>(actor: Actor, items: readonly T[], check: (item: T) => boolean): boolean {
  if (!isActive(actor)) return false;
  if (actor.role === "admin") return true;
  return items.length > 0 && items.every(check);
}

export function canViewAuditEntry(actor: Actor, entry: { actorUserId: string; subjectUserIds?: readonly string[] }): boolean {
  if (!isActive(actor)) return false;
  if (actor.role === "admin") return true;
  return entry.actorUserId === actor.uid || (entry.subjectUserIds ?? []).includes(actor.uid);
}

// ── Administrative safeguards ────────────────────────────────────────────

export type Denial = { ok: false; code: string; message: string };
export type Decision = { ok: true } | Denial;

const deny = (code: string, message: string): Denial => ({ ok: false, code, message });
const allow: Decision = { ok: true };

/**
 * Role changes: Admin only, never on yourself (no self-escalation / lock-out),
 * and the last active Admin cannot be demoted.
 */
export function decideRoleChange(
  actor: Actor,
  target: { uid: string; role: Role; status: UserStatus },
  nextRole: Role,
  activeAdminCount: number,
): Decision {
  if (!hasPermission(actor, "users.change_role")) return deny("forbidden", "Only an Admin can change roles.");
  if (actor.uid === target.uid) return deny("self_change", "You cannot change your own role. Ask another Admin.");
  if (target.role === nextRole) return deny("no_change", "The user already has this role.");
  if (target.role === "admin" && target.status === "active" && activeAdminCount <= 1) {
    return deny("last_admin", "This is the last active Admin. Promote another Admin first.");
  }
  return allow;
}

const STATUS_TRANSITIONS: Record<UserStatus, readonly UserStatus[]> = {
  invited: [],
  active: ["suspended", "deactivated"],
  suspended: ["active", "deactivated"],
  deactivated: ["active"],
};

export function allowedStatusTransitions(from: UserStatus): readonly UserStatus[] {
  return STATUS_TRANSITIONS[from];
}

export function decideStatusChange(
  actor: Actor,
  target: { uid: string; role: Role; status: UserStatus },
  nextStatus: UserStatus,
  activeAdminCount: number,
): Decision {
  if (!hasPermission(actor, "users.change_status")) return deny("forbidden", "Only an Admin can change account status.");
  if (actor.uid === target.uid) return deny("self_change", "You cannot change your own account status.");
  if (!STATUS_TRANSITIONS[target.status].includes(nextStatus)) {
    return deny("invalid_transition", `An account cannot move from ${target.status} to ${nextStatus}.`);
  }
  if (target.role === "admin" && target.status === "active" && nextStatus !== "active" && activeAdminCount <= 1) {
    return deny("last_admin", "This is the last active Admin and cannot be suspended or deactivated.");
  }
  return allow;
}

/** Fields a user may change on their own profile (RBAC §6). */
export const SELF_EDITABLE_PROFILE_FIELDS = ["displayName", "title", "photoURL"] as const;

/**
 * CRM access in this foundation is owner-based, in addition to organisation and
 * workspace membership. Campaign assignment visibility is introduced alongside
 * persisted campaign-member records in a later implementation phase.
 */
export interface CrmRecordAccess {
  organizationId: string;
  workspaceId: string;
  ownerUserId: string;
}

export function canAccessCrmRecord(
  actor: Actor | null | undefined,
  workspaceIds: ReadonlySet<string>,
  record: CrmRecordAccess,
): boolean {
  if (!actor || !isActive(actor) || actor.organizationId !== record.organizationId) return false;
  if (actor.role === "admin") return true;
  if (!workspaceIds.has(record.workspaceId)) return false;
  // Campaign assignment visibility is deliberately not inferred here. It will
  // be added with persisted CRM campaign membership records in the next phase.
  return record.ownerUserId === actor.uid;
}

export function canManageCrmRecord(
  actor: Actor | null | undefined,
  workspaceIds: ReadonlySet<string>,
  record: CrmRecordAccess,
): boolean {
  return canAccessCrmRecord(actor, workspaceIds, record);
}

// ── Navigation ───────────────────────────────────────────────────────────

export type NavKey =
  | "overview"
  | "workspaces"
  | "structure"
  | "projects"
  | "tasks"
  | "my-work"
  | "reports"
  | "notifications"
  | "people"
  | "analytics"
  | "activity"
  | "settings";

/** Modules shipped so far. Unreleased modules are never shown in navigation. */
export const RELEASED_NAV: ReadonlySet<NavKey> = new Set<NavKey>([
  "overview",
  "workspaces",
  "structure",
  "notifications",
  "people",
  "activity",
  "settings",
  "projects",
  "tasks",
  "reports",
]);

const NAV_BY_ROLE: Record<Role, readonly NavKey[]> = {
  admin: ["overview", "workspaces", "structure", "projects", "tasks", "my-work", "reports", "notifications", "people", "analytics", "activity", "settings"],
  lead: ["overview", "workspaces", "structure", "projects", "tasks", "my-work", "reports", "notifications", "people", "analytics", "activity", "settings"],
  member: ["overview", "workspaces", "structure", "projects", "tasks", "my-work", "reports", "notifications", "people", "activity", "settings"],
};

export function navFor(actor: Actor, released: ReadonlySet<NavKey> = RELEASED_NAV): NavKey[] {
  if (!isActive(actor)) return [];
  return NAV_BY_ROLE[actor.role].filter((k) => released.has(k));
}

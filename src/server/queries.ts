import "server-only";
import { FieldPath, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { canViewAuditEntry, canViewTeam, canViewUser, canViewWorkspace, canViewWorkstream, isAdmin, type Actor, type Scope } from "@/domain/authz";
import type { AppNotification, AuditLog, EmailDelivery, Invitation, MembershipType, Organization, Role, UserProfile, UserStatus, Workspace, Workstream, Team } from "@/domain/types";
import { COL, col, fromDoc, now, tsFromMs } from "./db";
import { adminDb } from "./firebase-admin";
import { serverEnv } from "./env";
import { getScope } from "./scope";
import { buildMemberManagementSnapshot } from "@/domain/member-management";

const PAGE = 25;
const org = () => serverEnv().ORGANIZATION_ID;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function usersByIds(ids: string[]): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, UserProfile>();
  if (!unique.length) return map;
  const db = adminDb();
  for (const part of chunk(unique, 200)) {
    const snaps = await db.getAll(...part.map((id) => db.collection(COL.users).doc(id)));
    snaps.forEach((s) => s.exists && map.set(s.id, fromDoc<UserProfile>(s, "uid")));
  }
  return map;
}

async function docsByIds<T>(collection: keyof typeof COL, ids: string[]): Promise<Map<string, T>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, T>();
  if (!unique.length) return map;
  const db = adminDb();
  for (const part of chunk(unique, 200)) {
    const snaps = await db.getAll(...part.map((id) => db.collection(COL[collection]).doc(id)));
    snaps.forEach((s) => s.exists && map.set(s.id, fromDoc<T>(s)));
  }
  return map;
}

export type PublicUser = Pick<UserProfile, "uid" | "displayName" | "email" | "role" | "status" | "title" | "photoURL" | "createdAt" | "lastLoginAt">;
const toPublic = (u: UserProfile): PublicUser => ({ uid: u.uid, displayName: u.displayName, email: u.email, role: u.role, status: u.status, title: u.title, photoURL: u.photoURL, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt });

// ── Organisation ────────────────────────────────────────────────────────

export async function getOrganization(): Promise<Organization | null> {
  const snap = await col("organizations").doc(org()).get();
  return snap.exists ? fromDoc<Organization>(snap) : null;
}

// ── People directory ────────────────────────────────────────────────────

export interface DirectoryQuery {
  q?: string;
  role?: Role;
  status?: UserStatus;
  cursor?: string;
}

export interface DirectoryPage {
  users: PublicUser[];
  nextCursor: string | null;
}

/** Users visible to a non-Admin: people sharing any team/workstream in their scope. */
async function scopedUserIds(actor: Actor, scope: Scope): Promise<string[]> {
  const teamIds = actor.role === "lead" ? [...scope.leadTeamIds, ...scope.memberTeamIds, ...scope.teamIdsViaLedWorkstreams] : [...scope.memberTeamIds];
  const streamIds = actor.role === "lead" ? [...scope.leadWorkstreamIds, ...scope.memberWorkstreamIds] : [];
  const ids = new Set<string>([actor.uid]);
  for (const part of chunk([...new Set(teamIds)], 30)) {
    const snap = await col("teamMemberships").where("teamId", "in", part).where("status", "==", "active").get();
    snap.docs.forEach((d) => ids.add(d.data().userId));
  }
  for (const part of chunk([...new Set(streamIds)], 30)) {
    const snap = await col("workstreamMemberships").where("workstreamId", "in", part).where("status", "==", "active").get();
    snap.docs.forEach((d) => ids.add(d.data().userId));
  }
  return [...ids];
}

export async function listDirectory(actor: Actor, query: DirectoryQuery): Promise<DirectoryPage> {
  const q = query.q?.trim().toLowerCase();
  if (isAdmin(actor)) {
    let ref: Query = col("users").where("organizationId", "==", org());
    if (query.role) ref = ref.where("role", "==", query.role);
    if (query.status) ref = ref.where("status", "==", query.status);
    if (q?.includes("@")) ref = ref.where("emailNormalized", ">=", q).where("emailNormalized", "<", q + "").orderBy("emailNormalized");
    else if (q) ref = ref.where("searchName", ">=", q).where("searchName", "<", q + "").orderBy("searchName");
    else ref = ref.orderBy("searchName");
    ref = ref.orderBy(FieldPath.documentId());
    if (query.cursor) {
      const cur = await col("users").doc(query.cursor).get();
      if (cur.exists) ref = ref.startAfter(q?.includes("@") ? cur.data()!.emailNormalized : cur.data()!.searchName, cur.id);
    }
    const snap = await ref.limit(PAGE + 1).get();
    const docs = snap.docs.slice(0, PAGE).map((d) => toPublic(fromDoc<UserProfile>(d, "uid")));
    return { users: docs, nextCursor: snap.docs.length > PAGE ? docs[docs.length - 1]!.uid : null };
  }
  // Non-Admin directories are bounded by team size, so filter and page in memory.
  const scope = await getScope(actor.uid);
  const map = await usersByIds(await scopedUserIds(actor, scope));
  let users = [...map.values()].filter((u) => u.status !== "deactivated" || u.uid === actor.uid);
  if (query.role) users = users.filter((u) => u.role === query.role);
  if (query.status) users = users.filter((u) => u.status === query.status);
  if (q) users = users.filter((u) => u.searchName.startsWith(q) || u.emailNormalized.startsWith(q) || u.searchName.includes(` ${q}`));
  users.sort((a, b) => a.searchName.localeCompare(b.searchName) || a.uid.localeCompare(b.uid));
  const start = query.cursor ? users.findIndex((u) => u.uid === query.cursor) + 1 : 0;
  const page = users.slice(start, start + PAGE);
  return { users: page.map(toPublic), nextCursor: start + PAGE < users.length ? page[page.length - 1]!.uid : null };
}

export interface MembershipRow {
  id: string;
  scopeKind: "team" | "workstream";
  scopeId: string;
  scopeName: string;
  scopeStatus: "active" | "archived";
  membershipType: MembershipType;
  status: "active" | "inactive";
  assignedAt: string;
  endedAt?: string;
}

export async function membershipsOf(uid: string, includeInactive = false): Promise<MembershipRow[]> {
  const [teams, streams] = await Promise.all([col("teamMemberships").where("userId", "==", uid).get(), col("workstreamMemberships").where("userId", "==", uid).get()]);
  const teamMap = await docsByIds<Team>("teams", teams.docs.map((d) => d.data().teamId));
  const streamMap = await docsByIds<Workstream>("workstreams", streams.docs.map((d) => d.data().workstreamId));
  const rows: MembershipRow[] = [];
  for (const d of teams.docs) {
    const m = fromDoc<Record<string, string>>(d);
    const t = teamMap.get(m.teamId!);
    rows.push({ id: d.id, scopeKind: "team", scopeId: m.teamId!, scopeName: t?.name ?? "Unknown team", scopeStatus: t?.status ?? "archived", membershipType: m.membershipType as MembershipType, status: m.status as "active", assignedAt: m.assignedAt!, endedAt: m.endedAt ?? undefined });
  }
  for (const d of streams.docs) {
    const m = fromDoc<Record<string, string>>(d);
    const w = streamMap.get(m.workstreamId!);
    rows.push({ id: d.id, scopeKind: "workstream", scopeId: m.workstreamId!, scopeName: w?.name ?? "Unknown workstream", scopeStatus: w?.status ?? "archived", membershipType: m.membershipType as MembershipType, status: m.status as "active", assignedAt: m.assignedAt!, endedAt: m.endedAt ?? undefined });
  }
  return rows.filter((r) => includeInactive || r.status === "active").sort((a, b) => a.scopeKind.localeCompare(b.scopeKind) || a.scopeName.localeCompare(b.scopeName));
}

export interface UserDetail {
  user: PublicUser;
  memberships: MembershipRow[];
  activity: AuditRow[];
}

export async function getUserDetail(actor: Actor, uid: string): Promise<UserDetail | null> {
  const snap = await col("users").doc(uid).get();
  if (!snap.exists) return null;
  const user = fromDoc<UserProfile>(snap, "uid");
  if (user.organizationId !== org()) return null;
  const scope = await getScope(actor.uid);
  const all = await membershipsOf(uid, isAdmin(actor));
  const active = all.filter((m) => m.status === "active");
  if (!canViewUser(actor, scope, uid, { teamIds: active.filter((m) => m.scopeKind === "team").map((m) => m.scopeId), workstreamIds: active.filter((m) => m.scopeKind === "workstream").map((m) => m.scopeId) })) {
    return null; // Same response as "missing": never confirm a hidden user exists.
  }
  // Non-Admins only see the memberships they could see anyway.
  const memberships = isAdmin(actor)
    ? all
    : active.filter((m) => (m.scopeKind === "team" ? canViewTeam(actor, scope, m.scopeId) : canViewWorkstream(actor, scope, m.scopeId)));
  const activity = isAdmin(actor) || actor.uid === uid ? (await listAudit(actor, { subjectUserId: uid })).rows : [];
  return { user: toPublic(user), memberships, activity };
}


export async function getMemberManagementSnapshot(actor: Actor) {
  if (!isAdmin(actor)) return null;
  const [usersSnap, teamMembershipsSnap, workstreamMembershipsSnap, teamsSnap, workstreamsSnap] = await Promise.all([
    col("users").where("organizationId", "==", org()).get(),
    col("teamMemberships").where("organizationId", "==", org()).get(),
    col("workstreamMemberships").where("organizationId", "==", org()).get(),
    col("teams").where("organizationId", "==", org()).where("status", "==", "active").get(),
    col("workstreams").where("organizationId", "==", org()).where("status", "==", "active").get(),
  ]);
  const users = usersSnap.docs.map((doc) => ({ uid: doc.id, role: doc.data().role as Role, status: doc.data().status as UserStatus }));
  const memberships = (docs: QueryDocumentSnapshot[], scopeField: "teamId" | "workstreamId") => docs.map((doc) => ({
    userId: String(doc.data().userId ?? ""),
    scopeId: String(doc.data()[scopeField] ?? ""),
    status: (doc.data().status === "active" ? "active" : "inactive") as "active" | "inactive",
  }));
  return buildMemberManagementSnapshot({
    users,
    teamMemberships: memberships(teamMembershipsSnap.docs, "teamId"),
    workstreamMemberships: memberships(workstreamMembershipsSnap.docs, "workstreamId"),
    activeTeams: teamsSnap.size,
    activeWorkstreams: workstreamsSnap.size,
    activeTeamIds: teamsSnap.docs.map((doc) => doc.id),
    activeWorkstreamIds: workstreamsSnap.docs.map((doc) => doc.id),
  });
}

// ── Invitations ─────────────────────────────────────────────────────────

export type InvitationRow = Invitation & { inviterName: string; expired: boolean };

export async function listInvitations(actor: Actor, status: "pending" | "all" = "pending"): Promise<InvitationRow[]> {
  if (!isAdmin(actor)) return [];
  let ref: Query = col("invitations").where("organizationId", "==", org());
  if (status === "pending") ref = ref.where("status", "==", "pending");
  const snap = await ref.orderBy("createdAt", "desc").limit(50).get();
  const rows = snap.docs.map((d) => {
    const { tokenHash: _h, tokenCiphertext: _c, ...rest } = fromDoc<Invitation & { tokenHash?: string; tokenCiphertext?: string }>(d);
    void _h;
    void _c;
    return rest as Invitation;
  });
  const inviters = await usersByIds(rows.map((r) => r.invitedBy));
  return rows.map((r) => ({ ...r, inviterName: inviters.get(r.invitedBy)?.displayName ?? "Unknown", expired: Date.parse(r.expiresAt) < Date.now() }));
}

// ── Structure ───────────────────────────────────────────────────────────

export async function listWorkspaces(actor: Actor, includeArchived = false): Promise<Workspace[]> {
  const scope = await getScope(actor.uid);
  const snap = await col("workspaces").where("organizationId", "==", org()).get();
  return snap.docs
    .map((d) => fromDoc<Workspace>(d))
    .filter((w) => canViewWorkspace(actor, scope, w.id))
    .filter((w) => includeArchived || w.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface ScopeSummary {
  id: string;
  kind: "team" | "workstream";
  name: string;
  description?: string;
  status: "active" | "archived";
  workspaceId: string;
  leads: PublicUser[];
  memberCount: number;
  linkedIds: string[];
  myMembership?: MembershipType;
}

async function rosterCounts(kind: "team" | "workstream", ids: string[]) {
  const result = new Map<string, { leads: string[]; count: number }>();
  for (const part of chunk(ids, 30)) {
    const snap = await col(kind === "team" ? "teamMemberships" : "workstreamMemberships").where(kind === "team" ? "teamId" : "workstreamId", "in", part).where("status", "==", "active").get();
    for (const d of snap.docs) {
      const m = d.data();
      const key = kind === "team" ? m.teamId : m.workstreamId;
      const entry = result.get(key) ?? { leads: [], count: 0 };
      entry.count++;
      if (m.membershipType === "lead") entry.leads.push(m.userId);
      result.set(key, entry);
    }
  }
  return result;
}

export async function listStructure(actor: Actor, includeArchived = false): Promise<{ workstreams: ScopeSummary[]; teams: ScopeSummary[] }> {
  const scope = await getScope(actor.uid);
  const [wsSnap, teamSnap, linkSnap] = await Promise.all([
    col("workstreams").where("organizationId", "==", org()).get(),
    col("teams").where("organizationId", "==", org()).get(),
    col("workstreamTeams").where("organizationId", "==", org()).where("status", "==", "active").get(),
  ]);
  const links = linkSnap.docs.map((d) => d.data() as { workstreamId: string; teamId: string });
  const streams = wsSnap.docs.map((d) => fromDoc<Workstream>(d)).filter((w) => canViewWorkstream(actor, scope, w.id) && (includeArchived || w.status === "active"));
  const teams = teamSnap.docs
    .map((d) => fromDoc<Team>(d))
    .filter((t) => canViewTeam(actor, scope, t.id, links.filter((l) => l.teamId === t.id).map((l) => l.workstreamId)) && (includeArchived || t.status === "active"));
  const [sCounts, tCounts] = await Promise.all([rosterCounts("workstream", streams.map((s) => s.id)), rosterCounts("team", teams.map((t) => t.id))]);
  const leadIds = [...sCounts.values(), ...tCounts.values()].flatMap((e) => e.leads);
  const users = await usersByIds(leadIds);
  const mine = (kind: "team" | "workstream", id: string): MembershipType | undefined =>
    kind === "team" ? (scope.leadTeamIds.has(id) ? "lead" : scope.memberTeamIds.has(id) ? "member" : undefined) : scope.leadWorkstreamIds.has(id) ? "lead" : scope.memberWorkstreamIds.has(id) ? "member" : undefined;
  const summarise = (kind: "team" | "workstream", r: Workstream, counts: Map<string, { leads: string[]; count: number }>): ScopeSummary => ({
    id: r.id,
    kind,
    name: r.name,
    description: r.description ?? undefined,
    status: r.status,
    workspaceId: r.workspaceId,
    leads: (counts.get(r.id)?.leads ?? []).map((id) => users.get(id)).filter((u): u is UserProfile => !!u).map(toPublic),
    memberCount: counts.get(r.id)?.count ?? 0,
    linkedIds: kind === "team" ? links.filter((l) => l.teamId === r.id).map((l) => l.workstreamId) : links.filter((l) => l.workstreamId === r.id).map((l) => l.teamId),
    myMembership: mine(kind, r.id),
  });
  return {
    workstreams: streams.map((s) => summarise("workstream", s, sCounts)).sort((a, b) => a.name.localeCompare(b.name)),
    teams: teams.map((t) => summarise("team", t, tCounts)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export interface RosterEntry {
  user: PublicUser;
  membershipType: MembershipType;
  assignedAt: string;
}

export interface ScopeDetail {
  summary: ScopeSummary;
  roster: RosterEntry[];
  linked: { id: string; name: string; status: "active" | "archived" }[];
  workspaceName: string;
}

export async function getScopeDetail(actor: Actor, kind: "team" | "workstream", id: string): Promise<ScopeDetail | null> {
  const snap = await col(kind === "team" ? "teams" : "workstreams").doc(id).get();
  if (!snap.exists) return null;
  const r = fromDoc<Workstream>(snap);
  if (r.organizationId !== org()) return null;
  const scope = await getScope(actor.uid);
  const linkSnap = await col("workstreamTeams").where(kind === "team" ? "teamId" : "workstreamId", "==", id).where("status", "==", "active").get();
  const linkedIds = linkSnap.docs.map((d) => (kind === "team" ? d.data().workstreamId : d.data().teamId) as string);
  const visible = kind === "team" ? canViewTeam(actor, scope, id, linkedIds) : canViewWorkstream(actor, scope, id);
  if (!visible) return null;
  const memSnap = await col(kind === "team" ? "teamMemberships" : "workstreamMemberships").where(kind === "team" ? "teamId" : "workstreamId", "==", id).where("status", "==", "active").get();
  const users = await usersByIds(memSnap.docs.map((d) => d.data().userId));
  const roster: RosterEntry[] = memSnap.docs
    .map((d) => ({ m: fromDoc<{ userId: string; membershipType: MembershipType; assignedAt: string }>(d), u: users.get(d.data().userId) }))
    .filter((x) => !!x.u)
    .map((x) => ({ user: toPublic(x.u!), membershipType: x.m.membershipType, assignedAt: x.m.assignedAt }))
    .sort((a, b) => (a.membershipType === b.membershipType ? a.user.displayName.localeCompare(b.user.displayName) : a.membershipType === "lead" ? -1 : 1));
  const linkedDocs = await docsByIds<Workstream>(kind === "team" ? "workstreams" : "teams", linkedIds);
  const linked = [...linkedDocs.values()]
    .filter((l) => (kind === "team" ? canViewWorkstream(actor, scope, l.id) || actor.role === "lead" : canViewTeam(actor, scope, l.id, [id])))
    .map((l) => ({ id: l.id, name: l.name, status: l.status }));
  const ws = await col("workspaces").doc(r.workspaceId).get();
  const leads = roster.filter((e) => e.membershipType === "lead").map((e) => e.user);
  return {
    summary: {
      id,
      kind,
      name: r.name,
      description: r.description ?? undefined,
      status: r.status,
      workspaceId: r.workspaceId,
      leads,
      memberCount: roster.length,
      linkedIds,
      myMembership: kind === "team" ? (scope.leadTeamIds.has(id) ? "lead" : scope.memberTeamIds.has(id) ? "member" : undefined) : scope.leadWorkstreamIds.has(id) ? "lead" : scope.memberWorkstreamIds.has(id) ? "member" : undefined,
    },
    roster,
    linked,
    workspaceName: String(ws.data()?.name ?? "Workspace"),
  };
}

// ── Audit ───────────────────────────────────────────────────────────────

export type AuditRow = AuditLog & { actorName: string };

export async function listAudit(actor: Actor, opts: { cursor?: string; subjectUserId?: string; limit?: number } = {}): Promise<{ rows: AuditRow[]; nextCursor: string | null }> {
  const limit = opts.limit ?? 30;
  let rows: AuditLog[] = [];
  let nextCursor: string | null = null;
  if (isAdmin(actor)) {
    let ref: Query = col("auditLogs").where("organizationId", "==", org());
    if (opts.subjectUserId) ref = ref.where("subjectUserIds", "array-contains", opts.subjectUserId);
    ref = ref.orderBy("createdAt", "desc");
    if (opts.cursor) {
      const cur = await col("auditLogs").doc(opts.cursor).get();
      if (cur.exists) ref = ref.startAfter(cur);
    }
    const snap = await ref.limit(limit + 1).get();
    rows = snap.docs.slice(0, limit).map((d) => fromDoc<AuditLog>(d));
    nextCursor = snap.docs.length > limit ? rows[rows.length - 1]!.id : null;
  } else {
    // Own activity only: entries the person performed, or that concern them.
    const before = opts.cursor ? (await col("auditLogs").doc(opts.cursor).get()).data()?.createdAt : undefined;
    const base = (q: Query) => (before ? q.where("createdAt", "<", before) : q).orderBy("createdAt", "desc").limit(limit + 1);
    const [a, b] = await Promise.all([
      base(col("auditLogs").where("organizationId", "==", org()).where("actorUserId", "==", actor.uid)).get(),
      base(col("auditLogs").where("organizationId", "==", org()).where("subjectUserIds", "array-contains", actor.uid)).get(),
    ]);
    const merged = new Map<string, AuditLog>();
    [...a.docs, ...b.docs].forEach((d) => merged.set(d.id, fromDoc<AuditLog>(d)));
    const sorted = [...merged.values()].filter((e) => canViewAuditEntry(actor, e)).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    rows = sorted.slice(0, limit);
    nextCursor = sorted.length > limit ? rows[rows.length - 1]!.id : null;
  }
  const names = await usersByIds(rows.map((r) => r.actorUserId));
  return { rows: rows.map((r) => ({ ...r, actorName: names.get(r.actorUserId)?.displayName ?? "System" })), nextCursor };
}

// ── Notifications ───────────────────────────────────────────────────────

export async function listNotifications(actor: Actor, opts: { cursor?: string; unread?: boolean } = {}): Promise<{ rows: AppNotification[]; nextCursor: string | null }> {
  let ref: Query = col("notifications").where("recipientUserId", "==", actor.uid);
  if (opts.unread) ref = ref.where("readAt", "==", null);
  ref = ref.orderBy("createdAt", "desc");
  if (opts.cursor) {
    const cur = await col("notifications").doc(opts.cursor).get();
    if (cur.exists && cur.data()?.recipientUserId === actor.uid) ref = ref.startAfter(cur);
  }
  const snap = await ref.limit(PAGE + 1).get();
  const rows = snap.docs.slice(0, PAGE).map((d) => fromDoc<AppNotification>(d));
  return { rows, nextCursor: snap.docs.length > PAGE ? rows[rows.length - 1]!.id : null };
}

export async function unreadCount(actor: Actor): Promise<number> {
  const agg = await col("notifications").where("recipientUserId", "==", actor.uid).where("readAt", "==", null).count().get();
  return agg.data().count;
}


export async function getPreferences(actor: Actor) {
  const snap = await col("notificationPreferences").doc(actor.uid).get();

  const data = snap.exists ? snap.data() : undefined;

  return {
    inAppEnabled: data?.inAppEnabled ?? true,
    emailEnabled: data?.emailEnabled ?? true,
    deliveryMode: data?.deliveryMode ?? ("immediate" as const),
    disabledEventTypes: data?.disabledEventTypes ?? [],
  };
}


// ── Dashboards ──────────────────────────────────────────────────────────

const count = async (q: Query) => (await q.count().get()).data().count;

export interface AdminOverview {
  users: { total: number; active: number; admins: number; leads: number; members: number; suspended: number; deactivated: number };
  workstreams: number;
  teams: number;
  pendingInvitations: number;
  expiringInvitations: InvitationRow[];
  failedEmails: number;
  failedEvents: number;
  recent: AuditRow[];
  unassignedActive: PublicUser[];
}

export async function adminOverview(actor: Actor): Promise<AdminOverview> {
  const users = col("users").where("organizationId", "==", org());
  const [total, active, admins, leads, members, suspended, deactivated, workstreams, teams, pendingInvitations, failedEmails, failedEvents, recent, invitations] = await Promise.all([
    count(users),
    count(users.where("status", "==", "active")),
    count(users.where("role", "==", "admin").where("status", "==", "active")),
    count(users.where("role", "==", "lead").where("status", "==", "active")),
    count(users.where("role", "==", "member").where("status", "==", "active")),
    count(users.where("status", "==", "suspended")),
    count(users.where("status", "==", "deactivated")),
    count(col("workstreams").where("organizationId", "==", org()).where("status", "==", "active")),
    count(col("teams").where("organizationId", "==", org()).where("status", "==", "active")),
    count(col("invitations").where("organizationId", "==", org()).where("status", "==", "pending")),
    count(col("emailDeliveries").where("organizationId", "==", org()).where("status", "==", "failed")),
    count(col("domainEvents").where("organizationId", "==", org()).where("status", "==", "failed")),
    listAudit(actor, { limit: 8 }),
    listInvitations(actor, "pending"),
  ]);
  const soon = Date.now() + 48 * 3_600_000;
  // Active non-Admins with no team: a common setup gap worth surfacing.
  const activeNonAdmins = await col("users").where("organizationId", "==", org()).where("status", "==", "active").where("role", "in", ["lead", "member"]).limit(200).get();
  const assigned = new Set<string>();
  for (const part of chunk(activeNonAdmins.docs.map((d) => d.id), 30)) {
    const m = await col("teamMemberships").where("userId", "in", part).where("status", "==", "active").get();
    m.docs.forEach((d) => assigned.add(d.data().userId));
  }
  const unassignedActive = activeNonAdmins.docs.filter((d) => !assigned.has(d.id)).slice(0, 6).map((d) => toPublic(fromDoc<UserProfile>(d, "uid")));
  return {
    users: { total, active, admins, leads, members, suspended, deactivated },
    workstreams,
    teams,
    pendingInvitations,
    expiringInvitations: invitations.filter((i) => Date.parse(i.expiresAt) < soon).slice(0, 5),
    failedEmails,
    failedEvents,
    recent: recent.rows,
    unassignedActive,
  };
}

export interface ScopedOverview {
  structure: { workstreams: ScopeSummary[]; teams: ScopeSummary[] };
  people: number;
  recent: AuditRow[];
  unread: number;
}

export async function scopedOverview(actor: Actor): Promise<ScopedOverview> {
  const scope = await getScope(actor.uid);
  const [structure, ids, recent, unread] = await Promise.all([listStructure(actor), scopedUserIds(actor, scope), listAudit(actor, { limit: 8 }), unreadCount(actor)]);
  return { structure, people: Math.max(0, ids.length - 1), recent: recent.rows, unread };
}

// ── Operations (Admin) ──────────────────────────────────────────────────

export async function deliveryHealth(actor: Actor) {
  if (!isAdmin(actor)) return null;
  const base = col("emailDeliveries").where("organizationId", "==", org());
  const since = tsFromMs(Date.now() - 7 * 86_400_000);
  const [pending, sent, delivered, bounced, failed, recentFailed, pendingEvents] = await Promise.all([
    count(base.where("status", "==", "pending")),
    count(base.where("status", "==", "sent").where("createdAt", ">=", since)),
    count(base.where("status", "==", "delivered").where("createdAt", ">=", since)),
    count(base.where("status", "==", "bounced")),
    count(base.where("status", "==", "failed")),
    base.where("status", "==", "failed").orderBy("updatedAt", "desc").limit(8).get(),
    count(col("domainEvents").where("organizationId", "==", org()).where("status", "in", ["pending", "processing"])),
  ]);
  return {
    pending,
    sent,
    delivered,
    bounced,
    failed,
    pendingEvents,
    recentFailures: recentFailed.docs.map((d) => {
      const r = fromDoc<EmailDelivery & { eventType?: string }>(d);
      return { id: r.id, recipientEmail: r.recipientEmail, eventType: r.eventType ?? "", lastErrorCode: r.lastErrorCode ?? "", updatedAt: r.updatedAt, attempts: r.attempts };
    }),
    checkedAt: now().toDate().toISOString(),
  };
}

/** Admin-only person picker for assignment dialogs (bounded). */
export async function pickablePeople(actor: Actor): Promise<PublicUser[]> {
  if (!isAdmin(actor)) return [];
  const snap = await col("users").where("organizationId", "==", org()).where("status", "in", ["active", "suspended"]).orderBy("searchName").limit(300).get();
  return snap.docs.map((d) => toPublic(fromDoc<UserProfile>(d, "uid")));
}

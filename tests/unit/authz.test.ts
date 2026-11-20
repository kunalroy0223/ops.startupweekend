import { describe, expect, it } from "vitest";
import { canActOnAll, canLeadTeam, canViewAuditEntry, canViewTeam, canViewUser, canViewWorkstream, decideRoleChange, decideStatusChange, hasPermission, navFor, type Actor, type Scope } from "@/domain/authz";

const actor = (role: Actor["role"], status: Actor["status"] = "active", uid = `${role}-1`): Actor => ({ uid, role, status, organizationId: "inhub", email: `${uid}@x.in`, displayName: uid });
const scope = (s: Partial<Record<keyof Scope, string[]>> = {}): Scope => ({
  workspaceIds: new Set(s.workspaceIds ?? []),
  leadWorkstreamIds: new Set(s.leadWorkstreamIds ?? []),
  leadTeamIds: new Set(s.leadTeamIds ?? []),
  memberWorkstreamIds: new Set(s.memberWorkstreamIds ?? []),
  memberTeamIds: new Set(s.memberTeamIds ?? []),
  teamIdsViaLedWorkstreams: new Set(s.teamIdsViaLedWorkstreams ?? []),
});

describe("global permissions", () => {
  it("Admin holds every administrative permission", () => {
    for (const p of ["users.invite", "users.change_role", "users.change_status", "memberships.manage", "structure.manage", "settings.manage", "audit.view_all"] as const) expect(hasPermission(actor("admin"), p)).toBe(true);
  });
  it("Lead and Team Member hold none in v1", () => {
    for (const r of ["lead", "member"] as const) {
      expect(hasPermission(actor(r), "users.invite")).toBe(false);
      expect(hasPermission(actor(r), "memberships.manage")).toBe(false);
      expect(hasPermission(actor(r), "settings.manage")).toBe(false);
    }
  });
  it("an inactive Admin has no permissions", () => {
    for (const s of ["suspended", "deactivated", "invited"] as const) expect(hasPermission(actor("admin", s), "users.invite")).toBe(false);
  });
});

describe("scoped visibility", () => {
  it("Admin sees every workstream and team regardless of assignment", () => {
    expect(canViewWorkstream(actor("admin"), scope(), "ws-x")).toBe(true);
    expect(canViewTeam(actor("admin"), scope(), "t-x")).toBe(true);
  });
  it("Lead cannot access a workstream outside their assignment", () => {
    const s = scope({ leadWorkstreamIds: ["ws-a"] });
    expect(canViewWorkstream(actor("lead"), s, "ws-a")).toBe(true);
    expect(canViewWorkstream(actor("lead"), s, "ws-b")).toBe(false);
  });
  it("Lead sees teams linked to a workstream they lead", () => {
    const s = scope({ leadWorkstreamIds: ["ws-a"], teamIdsViaLedWorkstreams: ["t-1"] });
    expect(canViewTeam(actor("lead"), s, "t-1")).toBe(true);
    expect(canViewTeam(actor("lead"), s, "t-2", ["ws-a"])).toBe(true);
    expect(canViewTeam(actor("lead"), s, "t-3", ["ws-z"])).toBe(false);
    expect(canLeadTeam(actor("lead"), s, "t-1")).toBe(true);
  });
  it("a Team Member sees only active team memberships, and not via workstream links", () => {
    const s = scope({ memberTeamIds: ["t-1"] });
    expect(canViewTeam(actor("member"), s, "t-1")).toBe(true);
    expect(canViewTeam(actor("member"), s, "t-2", ["ws-a"])).toBe(false);
    expect(canLeadTeam(actor("member"), s, "t-1")).toBe(false);
  });
  it("removing a membership removes access (scope is recomputed)", () => {
    expect(canViewTeam(actor("member"), scope({ memberTeamIds: [] }), "t-1")).toBe(false);
  });
  it("directory: members see teammates only; leads see their scope", () => {
    const m = actor("member");
    expect(canViewUser(m, scope({ memberTeamIds: ["t-1"] }), "u2", { teamIds: ["t-1"], workstreamIds: [] })).toBe(true);
    expect(canViewUser(m, scope({ memberTeamIds: ["t-1"] }), "u3", { teamIds: ["t-2"], workstreamIds: ["ws-a"] })).toBe(false);
    expect(canViewUser(m, scope(), m.uid, { teamIds: [], workstreamIds: [] })).toBe(true);
    const l = actor("lead");
    expect(canViewUser(l, scope({ leadWorkstreamIds: ["ws-a"] }), "u4", { teamIds: [], workstreamIds: ["ws-a"] })).toBe(true);
    expect(canViewUser(l, scope({ leadWorkstreamIds: ["ws-a"] }), "u5", { teamIds: ["t-9"], workstreamIds: [] })).toBe(false);
  });
  it("inactive users see nothing", () => {
    expect(canViewTeam(actor("member", "suspended"), scope({ memberTeamIds: ["t-1"] }), "t-1")).toBe(false);
  });
  it("cross-scope actions require every scope", () => {
    const s = scope({ leadTeamIds: ["t-1"] });
    const lead = actor("lead");
    expect(canActOnAll(lead, ["t-1"], (t) => canLeadTeam(lead, s, t))).toBe(true);
    expect(canActOnAll(lead, ["t-1", "t-2"], (t) => canLeadTeam(lead, s, t))).toBe(false);
    expect(canActOnAll(actor("admin"), ["t-1", "t-2"], () => false)).toBe(true);
  });
  it("audit: non-Admins only see entries they made or that concern them", () => {
    const m = actor("member");
    expect(canViewAuditEntry(m, { actorUserId: m.uid })).toBe(true);
    expect(canViewAuditEntry(m, { actorUserId: "x", subjectUserIds: [m.uid] })).toBe(true);
    expect(canViewAuditEntry(m, { actorUserId: "x", subjectUserIds: ["y"] })).toBe(false);
  });
});

describe("administrative safeguards", () => {
  const admin = actor("admin");
  it("no self role change or self escalation", () => {
    expect(decideRoleChange(admin, { uid: admin.uid, role: "admin", status: "active" }, "member", 3)).toMatchObject({ ok: false, code: "self_change" });
    const m = actor("member");
    expect(decideRoleChange(m, { uid: m.uid, role: "member", status: "active" }, "admin", 1)).toMatchObject({ ok: false, code: "forbidden" });
  });
  it("Lead cannot change roles", () => {
    expect(decideRoleChange(actor("lead"), { uid: "u", role: "member", status: "active" }, "lead", 1)).toMatchObject({ ok: false, code: "forbidden" });
  });
  it("cannot demote or deactivate the last active Admin", () => {
    expect(decideRoleChange(admin, { uid: "a2", role: "admin", status: "active" }, "lead", 1)).toMatchObject({ code: "last_admin" });
    expect(decideStatusChange(admin, { uid: "a2", role: "admin", status: "active" }, "deactivated", 1)).toMatchObject({ code: "last_admin" });
    expect(decideRoleChange(admin, { uid: "a2", role: "admin", status: "active" }, "lead", 2)).toEqual({ ok: true });
  });
  it("status follows the account lifecycle", () => {
    expect(decideStatusChange(admin, { uid: "u", role: "member", status: "active" }, "suspended", 1)).toEqual({ ok: true });
    expect(decideStatusChange(admin, { uid: "u", role: "member", status: "deactivated" }, "active", 1)).toEqual({ ok: true });
    expect(decideStatusChange(admin, { uid: "u", role: "member", status: "deactivated" }, "suspended", 1)).toMatchObject({ code: "invalid_transition" });
    expect(decideStatusChange(admin, { uid: admin.uid, role: "admin", status: "active" }, "suspended", 5)).toMatchObject({ code: "self_change" });
  });
});

describe("navigation", () => {
  it("never shows inaccessible or unreleased items", () => {
    expect(navFor(actor("member"))).not.toContain("analytics");
    expect(navFor(actor("admin"))).toContain("settings");
    expect(navFor(actor("admin"))).toContain("tasks");
    expect(navFor(actor("admin"))).toContain("reports");
    expect(navFor(actor("member"))).toContain("tasks");
    expect(navFor(actor("member"))).toContain("reports");
    expect(navFor(actor("member", "suspended"))).toEqual([]);
  });
});

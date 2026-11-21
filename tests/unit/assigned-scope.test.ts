import { describe, expect, it } from "vitest";
import {
  canManageAssignedScope,
  type Actor,
  type Scope,
} from "@/domain/authz";

const lead: Actor = {
  uid: "lead-1",
  organizationId: "inhub",
  role: "lead",
  status: "active",
  email: "lead@inhub.test",
  displayName: "Testing Lead",
};

const member: Actor = {
  ...lead,
  uid: "member-1",
  role: "member",
  email: "member@inhub.test",
  displayName: "Team Member",
};

function makeScope(overrides: Partial<Scope> = {}): Scope {
  return {
    workspaceIds: new Set(["workspace-1"]),
    leadWorkstreamIds: new Set(),
    leadTeamIds: new Set(["team-testing"]),
    memberWorkstreamIds: new Set(["workstream-demo"]),
    memberTeamIds: new Set(),
    teamIdsViaLedWorkstreams: new Set(),
    ...overrides,
  };
}

describe("canManageAssignedScope", () => {
  it("allows a Lead through their team when the associated workstream is only a member scope", () => {
    expect(
      canManageAssignedScope(
        lead,
        makeScope(),
        "workspace-1",
        "team-testing",
        "workstream-demo",
      ),
    ).toBe(true);
  });

  it("allows a Lead through their workstream when the team is linked to that led workstream", () => {
    const scope = makeScope({
      leadTeamIds: new Set(),
      leadWorkstreamIds: new Set(["workstream-demo"]),
      teamIdsViaLedWorkstreams: new Set(["team-testing"]),
    });

    expect(
      canManageAssignedScope(lead, scope, "workspace-1", "team-testing", "workstream-demo"),
    ).toBe(true);
  });

  it("allows a Lead through a directly led workstream even without team membership", () => {
    const scope = makeScope({
      leadTeamIds: new Set(),
      leadWorkstreamIds: new Set(["workstream-demo"]),
    });

    expect(
      canManageAssignedScope(lead, scope, "workspace-1", undefined, "workstream-demo"),
    ).toBe(true);
  });

  it("denies a Lead when neither associated scope is led", () => {
    const scope = makeScope({
      leadTeamIds: new Set(),
      leadWorkstreamIds: new Set(),
      teamIdsViaLedWorkstreams: new Set(),
    });

    expect(
      canManageAssignedScope(lead, scope, "workspace-1", "team-testing", "workstream-demo"),
    ).toBe(false);
  });

  it("denies a Lead outside the workspace even when the team is led", () => {
    expect(
      canManageAssignedScope(lead, makeScope(), "another-workspace", "team-testing", "workstream-demo"),
    ).toBe(false);
  });

  it("does not allow an unscoped task through workspace membership alone", () => {
    expect(canManageAssignedScope(lead, makeScope(), "workspace-1")).toBe(false);
  });

  it("does not grant Lead management scope to a Team Member", () => {
    expect(
      canManageAssignedScope(member, makeScope(), "workspace-1", "team-testing", "workstream-demo"),
    ).toBe(false);
  });

  it("denies inactive Leads", () => {
    expect(
      canManageAssignedScope(
        { ...lead, status: "suspended" },
        makeScope(),
        "workspace-1",
        "team-testing",
        "workstream-demo",
      ),
    ).toBe(false);
  });
});

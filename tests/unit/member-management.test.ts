import { describe, expect, it } from "vitest";
import { buildMemberManagementSnapshot } from "@/domain/member-management";

describe("Module 6 member and team management overview", () => {
  it("counts active roles, assignments and non-admin people without a team", () => {
    const snapshot = buildMemberManagementSnapshot({
      users: [
        { uid: "admin", role: "admin", status: "active" },
        { uid: "lead", role: "lead", status: "active" },
        { uid: "member-1", role: "member", status: "active" },
        { uid: "member-2", role: "member", status: "suspended" },
      ],
      teamMemberships: [
        { userId: "lead", scopeId: "team-1", status: "active" },
        { userId: "member-1", scopeId: "team-1", status: "active" },
        { userId: "member-2", scopeId: "team-1", status: "inactive" },
      ],
      workstreamMemberships: [
        { userId: "lead", scopeId: "stream-1", status: "active" },
        { userId: "member-2", scopeId: "stream-1", status: "active" },
      ],
      activeTeams: 2,
      activeWorkstreams: 3,
      activeTeamIds: ["team-1", "team-2"],
      activeWorkstreamIds: ["stream-1", "stream-2", "stream-3"],
    });

    expect(snapshot).toEqual({
      totalPeople: 4,
      activePeople: 3,
      activeLeads: 1,
      activeMembers: 1,
      activeAdmins: 1,
      activeTeams: 2,
      activeWorkstreams: 3,
      activeTeamAssignments: 2,
      activeWorkstreamAssignments: 1,
      activePeopleWithoutTeam: 0,
    });
  });

  it("does not treat suspended members as active or count admins as unassigned team members", () => {
    const snapshot = buildMemberManagementSnapshot({
      users: [
        { uid: "admin", role: "admin", status: "active" },
        { uid: "suspended", role: "member", status: "suspended" },
        { uid: "unassigned", role: "member", status: "active" },
      ],
      teamMemberships: [],
      workstreamMemberships: [],
      activeTeams: 0,
      activeWorkstreams: 0,
      activeTeamIds: [],
      activeWorkstreamIds: [],
    });
    expect(snapshot.activePeople).toBe(2);
    expect(snapshot.activePeopleWithoutTeam).toBe(1);
  });
});

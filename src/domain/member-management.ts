import type { Role, UserStatus } from "./types";

export interface MemberManagementUser {
  uid: string;
  role: Role;
  status: UserStatus;
}

export interface MemberManagementMembership {
  userId: string;
  scopeId: string;
  status: "active" | "inactive";
}

export interface MemberManagementSnapshot {
  totalPeople: number;
  activePeople: number;
  activeLeads: number;
  activeMembers: number;
  activeAdmins: number;
  activeTeams: number;
  activeWorkstreams: number;
  activeTeamAssignments: number;
  activeWorkstreamAssignments: number;
  activePeopleWithoutTeam: number;
}

/** Exact, descriptive counts only. This is an organisation roster snapshot, not a performance score. */
export function buildMemberManagementSnapshot(input: {
  users: MemberManagementUser[];
  teamMemberships: MemberManagementMembership[];
  workstreamMemberships: MemberManagementMembership[];
  activeTeams: number;
  activeWorkstreams: number;
  activeTeamIds: string[];
  activeWorkstreamIds: string[];
}): MemberManagementSnapshot {
  const activePeople = input.users.filter((user) => user.status === "active");
  const activeUserIds = new Set(activePeople.map((user) => user.uid));
  const activeTeamIds = new Set(input.activeTeamIds);
  const activeWorkstreamIds = new Set(input.activeWorkstreamIds);
  const activeTeamMemberships = input.teamMemberships.filter((membership) => membership.status === "active" && activeUserIds.has(membership.userId) && activeTeamIds.has(membership.scopeId));
  const activeWorkstreamMemberships = input.workstreamMemberships.filter((membership) => membership.status === "active" && activeUserIds.has(membership.userId) && activeWorkstreamIds.has(membership.scopeId));
  const assignedToTeam = new Set(activeTeamMemberships.map((membership) => membership.userId));
  return {
    totalPeople: input.users.length,
    activePeople: activePeople.length,
    activeLeads: activePeople.filter((user) => user.role === "lead").length,
    activeMembers: activePeople.filter((user) => user.role === "member").length,
    activeAdmins: activePeople.filter((user) => user.role === "admin").length,
    activeTeams: input.activeTeams,
    activeWorkstreams: input.activeWorkstreams,
    activeTeamAssignments: activeTeamMemberships.length,
    activeWorkstreamAssignments: activeWorkstreamMemberships.length,
    activePeopleWithoutTeam: activePeople.filter((user) => user.role !== "admin" && !assignedToTeam.has(user.uid)).length,
  };
}

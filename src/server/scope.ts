import "server-only";
import { cache } from "react";
import type { Scope } from "@/domain/authz";
import { col } from "./db";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Loads the user's authoritative scope from active membership documents.
 * Never derived from client state or token claims.
 */
export async function loadScope(uid: string): Promise<Scope> {
  const [teamSnap, streamSnap] = await Promise.all([
    col("teamMemberships").where("userId", "==", uid).where("status", "==", "active").get(),
    col("workstreamMemberships").where("userId", "==", uid).where("status", "==", "active").get(),
  ]);
  const workspaceIds = new Set<string>();
  const leadTeamIds = new Set<string>();
  const memberTeamIds = new Set<string>();
  const leadWorkstreamIds = new Set<string>();
  const memberWorkstreamIds = new Set<string>();

  for (const d of teamSnap.docs) {
    const m = d.data();
    workspaceIds.add(m.workspaceId);
    (m.membershipType === "lead" ? leadTeamIds : memberTeamIds).add(m.teamId);
  }
  for (const d of streamSnap.docs) {
    const m = d.data();
    workspaceIds.add(m.workspaceId);
    (m.membershipType === "lead" ? leadWorkstreamIds : memberWorkstreamIds).add(m.workstreamId);
  }

  const teamIdsViaLedWorkstreams = new Set<string>();
  for (const ids of chunk([...leadWorkstreamIds], 30)) {
    const links = await col("workstreamTeams").where("workstreamId", "in", ids).where("status", "==", "active").get();
    links.docs.forEach((d) => teamIdsViaLedWorkstreams.add(d.data().teamId));
  }

  return { workspaceIds, leadTeamIds, memberTeamIds, leadWorkstreamIds, memberWorkstreamIds, teamIdsViaLedWorkstreams };
}

export const getScope = cache(loadScope);

export async function getMembershipsOf(uid: string): Promise<{ teamIds: string[]; workstreamIds: string[] }> {
  const scope = await getScope(uid);
  return {
    teamIds: [...scope.leadTeamIds, ...scope.memberTeamIds],
    workstreamIds: [...scope.leadWorkstreamIds, ...scope.memberWorkstreamIds],
  };
}

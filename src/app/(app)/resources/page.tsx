import type { Metadata } from "next";
import { ResourcesWorkspace } from "@/components/resources/resources-workspace";
import { listStructure, listWorkspaces, listDirectory } from "@/server/queries";
import { requireActive } from "@/server/session";
import { listOperationsWorkspace, listResourceWorkspace } from "@/server/services/operational-modules";

export const metadata: Metadata = { title: "Resources & Assets" };
export const dynamic = "force-dynamic";

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const { actor } = await requireActive();
  const params = await searchParams;
  const [workspaces, structure, directory] = await Promise.all([listWorkspaces(actor), listStructure(actor), listDirectory(actor, {})]);
  const workspace = workspaces.find((item) => item.id === params.workspaceId) ?? workspaces[0];
  const data = workspace ? await listResourceWorkspace(actor, workspace.id) : { resources: [], allocations: [] };
  const operations = workspace ? await listOperationsWorkspace(actor, workspace.id) : { events: [], programmes: [], sessions: [] };
  return <ResourcesWorkspace workspace={workspace ? { id: workspace.id, name: workspace.name } : null} workspaces={workspaces.map(({ id, name }) => ({ id, name }))} role={actor.role} currentUserId={actor.uid} resources={data.resources} allocations={data.allocations} events={operations.events.map(({ id, title }) => ({ id, name: title }))} people={directory.users.filter((u) => u.status === "active").map(({ uid, displayName, role }) => ({ uid, displayName, role }))} workstreams={structure.workstreams.filter((item) => !workspace || item.workspaceId === workspace.id).map(({ id, name }) => ({ id, name }))} teams={structure.teams.filter((item) => !workspace || item.workspaceId === workspace.id).map(({ id, name }) => ({ id, name }))} />;
}

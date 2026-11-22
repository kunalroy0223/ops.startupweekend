import type { Metadata } from "next";
import { EventsProgrammesWorkspace } from "@/components/operations/events-programmes-workspace";
import { listStructure, listWorkspaces } from "@/server/queries";
import { requireActive } from "@/server/session";
import { listOperationsWorkspace } from "@/server/services/operational-modules";

export const metadata: Metadata = { title: "Events & Programmes" };
export const dynamic = "force-dynamic";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const { actor } = await requireActive();
  const params = await searchParams;
  const [workspaces, structure] = await Promise.all([listWorkspaces(actor), listStructure(actor)]);
  const workspace = workspaces.find((item) => item.id === params.workspaceId) ?? workspaces[0];
  const data = workspace ? await listOperationsWorkspace(actor, workspace.id) : { programmes: [], events: [], sessions: [] };
  const visibleStreams = structure.workstreams.filter((item) => !workspace || item.workspaceId === workspace.id);
  const visibleTeams = structure.teams.filter((item) => !workspace || item.workspaceId === workspace.id);
  return <EventsProgrammesWorkspace workspace={workspace ? { id: workspace.id, name: workspace.name } : null} workspaces={workspaces.map(({ id, name }) => ({ id, name }))} role={actor.role} currentUserId={actor.uid} programmes={data.programmes} events={data.events} sessions={data.sessions} workstreams={visibleStreams.map(({ id, name }) => ({ id, name }))} teams={visibleTeams.map(({ id, name }) => ({ id, name }))} />;
}

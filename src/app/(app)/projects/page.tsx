import { ProjectWorkspace } from "@/components/tasks/project-workspace";
import { isAdmin } from "@/domain/authz";
import { getOrganization, listStructure, listWorkspaces } from "@/server/queries";
import { listProjects, listTasks } from "@/server/services/tasks";
import { requireActive } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { actor } = await requireActive();
  const params = await searchParams;
  const showArchived = params.archived === "1" && (isAdmin(actor) || actor.role === "lead");
  const [projects, tasks, workspaces, structure, organization] = await Promise.all([
    listProjects(actor, showArchived), listTasks(actor), listWorkspaces(actor), listStructure(actor), getOrganization(),
  ]);
  return <ProjectWorkspace key={showArchived ? "deleted" : "active"}
    initialProjects={projects}
    tasks={tasks}
    workspaces={workspaces.map(w => ({ id: w.id, name: w.name }))}
    teams={structure.teams}
    workstreams={structure.workstreams}
    canManage={isAdmin(actor) || actor.role === "lead"}
    showArchived={showArchived}
    timeZone={organization?.timezone ?? "Asia/Kolkata"}
  />;
}

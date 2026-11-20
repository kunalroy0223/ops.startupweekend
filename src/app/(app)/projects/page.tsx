import { ProjectWorkspace } from "@/components/tasks/project-workspace";
import { isAdmin } from "@/domain/authz";
import { listStructure, listWorkspaces } from "@/server/queries";
import { listProjects, listTasks } from "@/server/services/tasks";
import { requireActive } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { actor } = await requireActive();
  const [projects, tasks, workspaces, structure] = await Promise.all([
    listProjects(actor), listTasks(actor), listWorkspaces(actor), listStructure(actor),
  ]);
  return <ProjectWorkspace
    initialProjects={projects}
    tasks={tasks}
    workspaces={workspaces.map(w => ({ id: w.id, name: w.name }))}
    teams={structure.teams}
    workstreams={structure.workstreams}
    canManage={isAdmin(actor) || actor.role === "lead"}
  />;
}

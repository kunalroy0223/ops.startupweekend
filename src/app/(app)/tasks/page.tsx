import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { isAdmin } from "@/domain/authz";
import { getOrganization, listDirectory, listStructure, listWorkspaces, pickablePeople } from "@/server/queries";
import { listProjects, listTasks } from "@/server/services/tasks";
import { requireActive } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ project?: string; deleted?: string }> }) {
  const { actor } = await requireActive();
  const params = await searchParams;
  const [tasks, projects, workspaces, structure, directory, adminPeople, organization] = await Promise.all([
    listTasks(actor, (params.deleted === "1" && isAdmin(actor)) || (params.deleted === "1" && actor.role === "lead")), listProjects(actor), listWorkspaces(actor), listStructure(actor), listDirectory(actor, {}),
    isAdmin(actor) ? pickablePeople(actor) : Promise.resolve([]), getOrganization(),
  ]);
  const people = isAdmin(actor) ? adminPeople : directory.users;
  if (!people.some(user => user.uid === actor.uid)) people.unshift({ uid: actor.uid, displayName: actor.displayName, email: actor.email, role: actor.role, status: actor.status, createdAt: "" });
  return <TaskWorkspace key={params.deleted === "1" && (isAdmin(actor) || actor.role === "lead") ? "deleted" : "active"}
    initialTasks={tasks}
    projects={projects}
    workspaces={workspaces.map(w => ({ id: w.id, name: w.name }))}
    teams={structure.teams}
    workstreams={structure.workstreams}
    people={people.filter(u => u.status === "active")}
    canManage={isAdmin(actor) || actor.role === "lead"}
    currentUserId={actor.uid}
    timeZone={organization?.timezone ?? "Asia/Kolkata"}
    initialProjectId={params.project || "all"}
    showDeleted={params.deleted === "1" && (isAdmin(actor) || actor.role === "lead")}
  />;
}

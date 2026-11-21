import { ok, requireApiActor, route } from "@/server/http";
import { listDirectory, listStructure, listWorkspaces } from "@/server/queries";
import { listProjects, listTasks } from "@/server/services/tasks";
import { listMyReports, listReviewQueue } from "@/server/services/work-reports";

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLocaleLowerCase().slice(0, 80);
  if (q.length < 2) return ok({ items: [] });

  const [directory, projects, tasks, myReports, reviewReports, workspaces, structure] = await Promise.all([
    listDirectory(actor, { q }),
    listProjects(actor),
    listTasks(actor),
    listMyReports(actor),
    actor.role === "admin" || actor.role === "lead" ? listReviewQueue(actor) : Promise.resolve([]),
    listWorkspaces(actor),
    listStructure(actor),
  ]);

  const items: { id: string; type: "person" | "project" | "task" | "report" | "workspace" | "team" | "workstream"; title: string; subtitle: string; href: string }[] = [];
  for (const person of directory.users) {
    items.push({ id: `person-${person.uid}`, type: "person", title: person.displayName, subtitle: person.email, href: `/people/${person.uid}` });
  }
  for (const project of projects.filter((p) => `${p.name} ${p.description ?? ""}`.toLocaleLowerCase().includes(q)).slice(0, 6)) {
    items.push({ id: `project-${project.id}`, type: "project", title: project.name, subtitle: project.description || "Project", href: `/tasks?project=${encodeURIComponent(project.id)}` });
  }
  for (const task of tasks.filter((t) => `${t.title} ${t.description ?? ""}`.toLocaleLowerCase().includes(q)).slice(0, 8)) {
    items.push({ id: `task-${task.id}`, type: "task", title: task.title, subtitle: `Task · ${task.status.replaceAll("_", " ")}`, href: `/tasks/${task.id}` });
  }
  const reports = [...myReports, ...reviewReports].filter((report, index, all) => all.findIndex((candidate) => candidate.id === report.id) === index);
  for (const report of reports.filter((r) => `${r.reportDate} ${r.status}`.toLocaleLowerCase().includes(q)).slice(0, 6)) {
    items.push({ id: `report-${report.id}`, type: "report", title: `Work report · ${report.reportDate}`, subtitle: `Report · ${report.status.replaceAll("_", " ")}`, href: `/reports/${report.id}` });
  }
  for (const workspace of workspaces.filter((w) => w.name.toLocaleLowerCase().includes(q)).slice(0, 4)) {
    items.push({ id: `workspace-${workspace.id}`, type: "workspace", title: workspace.name, subtitle: "Workspace", href: "/workspaces" });
  }
  for (const team of structure.teams.filter((t) => t.name.toLocaleLowerCase().includes(q)).slice(0, 4)) {
    items.push({ id: `team-${team.id}`, type: "team", title: team.name, subtitle: "Team", href: `/structure/teams/${team.id}` });
  }
  for (const stream of structure.workstreams.filter((w) => w.name.toLocaleLowerCase().includes(q)).slice(0, 4)) {
    items.push({ id: `workstream-${stream.id}`, type: "workstream", title: stream.name, subtitle: "Workstream", href: `/structure/workstreams/${stream.id}` });
  }

  const priority: Record<typeof items[number]["type"], number> = { person: 0, task: 1, project: 2, report: 3, team: 4, workstream: 5, workspace: 6 };
  items.sort((a, b) => priority[a.type] - priority[b.type] || a.title.localeCompare(b.title));
  return ok({ items: items.slice(0, 30), query: q });
});

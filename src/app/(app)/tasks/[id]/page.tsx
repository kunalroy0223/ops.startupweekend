import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TaskDetailWorkspace } from "@/components/tasks/task-detail-workspace";
import { isAdmin } from "@/domain/authz";
import { getOrganization, listDirectory, listStructure, pickablePeople } from "@/server/queries";
import { getTaskDetail } from "@/server/services/task-collaboration";
import { listProjects, listTasks } from "@/server/services/tasks";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Task" };
export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireActive();
  const { id } = await params;
  const [detail, directory, admins, availableTasks, projects, structure, organization] = await Promise.all([
    getTaskDetail(actor, id), listDirectory(actor, {}), isAdmin(actor) ? pickablePeople(actor) : Promise.resolve([]), listTasks(actor), listProjects(actor), listStructure(actor), getOrganization(),
  ]);
  if (!detail) notFound();
  const people = isAdmin(actor) ? admins : directory.users;
  if (!people.some(p => p.uid === actor.uid)) people.unshift({ uid: actor.uid, displayName: actor.displayName, email: actor.email, role: actor.role, status: actor.status, createdAt: "" });
  return <TaskDetailWorkspace currentUserId={actor.uid} task={detail.task} comments={detail.comments} activity={detail.activity} people={people.filter(p => p.status === "active")} canManage={detail.canManage} canUpdateStatus={detail.canManage || (actor.role === "member" && detail.task.accountableUserId === actor.uid)} availableTasks={availableTasks} projects={projects} teams={structure.teams} workstreams={structure.workstreams} timeZone={organization?.timezone ?? "Asia/Kolkata"} />;
}

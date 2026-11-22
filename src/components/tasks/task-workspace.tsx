"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArchiveRestore, Filter, ListTodo, Plus, Search, Trash2, X } from "lucide-react";
import type { Project, Task, TaskPriority, TaskStatus } from "@/domain/types";
import type { PublicUser, ScopeSummary } from "@/server/queries";
import { api, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { dateTimeToIso, formatDateTimeInTimeZone } from "@/lib/timezone";

const statuses: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" }, { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" }, { value: "in_review", label: "In Review" },
  { value: "completed", label: "Completed" }, { value: "blocked", label: "Blocked" },
  { value: "cancelled", label: "Cancelled" },
];
const priorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
const statusTone: Record<TaskStatus, "neutral" | "info" | "accent" | "warning" | "success" | "danger"> = {
  backlog: "neutral", assigned: "info", in_progress: "accent", in_review: "warning",
  completed: "success", blocked: "danger", cancelled: "neutral",
};
const label = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

function Labeled({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`grid gap-1.5 text-[13px] font-semibold ${className}`}>{label}{children}</label>; }

export function TaskWorkspace({ initialTasks, projects, workspaces, teams, workstreams, people, canManage, currentUserId, timeZone, initialProjectId = "all", showDeleted = false }: {
  initialTasks: Task[]; projects: Project[]; workspaces: { id: string; name: string }[];
  teams: ScopeSummary[]; workstreams: ScopeSummary[]; people: PublicUser[]; canManage: boolean; currentUserId: string; timeZone: string; initialProjectId?: string; showDeleted?: boolean;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState(initialProjectId);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [view, setView] = useState<"list" | "board">("list");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [form, setForm] = useState({
    title: "", workspaceId: workspaces[0]?.id ?? "", projectId: "", teamId: "", workstreamId: "",
    accountableUserId: people[0]?.uid ?? "", priority: "medium" as TaskPriority,
    startAt: "", dueAt: "", description: "", acceptanceCriteria: "",
  });
  const filtered = useMemo(() => tasks.filter(t =>
    (statusFilter === "all" || t.status === statusFilter) &&
    (projectFilter === "all" || t.projectId === projectFilter) &&
    (priorityFilter === "all" || t.priority === priorityFilter) &&
    (!query || `${t.title} ${t.description ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  ), [tasks, statusFilter, projectFilter, priorityFilter, query]);

  async function createTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const startAt = form.startAt ? dateTimeToIso(form.startAt, timeZone) : undefined;
    const dueAt = form.dueAt ? dateTimeToIso(form.dueAt, timeZone) : undefined;
    if (form.startAt && !startAt) { setError("That planned start is not valid in the organisation timezone. Choose another time."); return; }
    if (form.dueAt && !dueAt) { setError("That date and time is not valid in the organisation timezone. Choose another time."); return; }
    setBusy(true);
    try {
      await api("/api/tasks", { method: "POST", body: {
        workspaceId: form.workspaceId, projectId: form.projectId || undefined,
        teamId: form.teamId || undefined, workstreamId: form.workstreamId || undefined, title: form.title, description: form.description || undefined,
        acceptanceCriteria: form.acceptanceCriteria || undefined, accountableUserId: form.accountableUserId,
        collaboratorUserIds: [], priority: form.priority,
        startAt, dueAt,
        dependencyIds: [],
      }});
      setShowCreate(false); setForm(v => ({ ...v, title: "", description: "", acceptanceCriteria: "", startAt: "", dueAt: "" }));
      router.refresh();
      const data = await api<{ tasks: Task[] }>("/api/tasks"); setTasks(data.tasks);
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to create task."); }
    finally { setBusy(false); }
  }

  const quickTransitions = (task: Task): TaskStatus[] => {
    const managerPaths: Partial<Record<TaskStatus, TaskStatus[]>> = {
      backlog: ["assigned"], assigned: ["backlog", "in_progress"],
      in_progress: ["in_review", "blocked"], in_review: ["in_progress", "completed"],
      blocked: ["in_progress"], completed: [], cancelled: [],
    };
    const memberPaths: Partial<Record<TaskStatus, TaskStatus[]>> = {
      assigned: ["in_progress"], in_progress: ["in_review", "blocked"], blocked: ["in_progress"],
    };
    if (canManage) return managerPaths[task.status] ?? [];
    return task.accountableUserId === currentUserId ? memberPaths[task.status] ?? [] : [];
  };

  async function changeStatus(task: Task, status: TaskStatus) {
    setError("");
    try {
      await api(`/api/tasks/${task.id}/status`, { method: "POST", body: { status } });
      setTasks(old => old.map(t => t.id === task.id ? { ...t, status } : t));
      router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to update task status."); }
  }

  async function deleteSelectedTask() {
    if (!deleting) return;
    setDeleteBusy(true); setError("");
    try {
      if (showDeleted) await api(`/api/tasks/${deleting.id}`, { method: "POST" });
      else await api(`/api/tasks/${deleting.id}`, { method: "DELETE" });
      setTasks(old => old.filter(task => task.id !== deleting.id));
      setDeleting(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to delete task.");
    } finally { setDeleteBusy(false); }
  }

  const teamName = (id?: string) => teams.find(t => t.id === id)?.name;
  const personName = (id: string) => people.find(p => p.uid === id)?.displayName ?? "Assigned user";
  return <div className="space-y-6">
    <PageHeader eyebrow="WORK MANAGEMENT" title="Tasks" description="Plan work, assign clear ownership and keep delivery moving."
      icon={<ListTodo />}
      actions={<div className="flex flex-wrap gap-2">{canManage ? <LinkButton href={showDeleted ? "/tasks" : "/tasks?deleted=1"} size="sm" icon={showDeleted ? <ListTodo /> : <ArchiveRestore />}>{showDeleted ? "Active tasks" : "Deleted tasks"}</LinkButton> : null}{canManage && !showDeleted ? <Button onClick={() => setShowCreate(v => !v)} icon={showCreate ? <X /> : <Plus />}>{showCreate ? "Close" : "Create task"}</Button> : null}</div>}
      meta={<><Badge>{tasks.length} {showDeleted ? "deleted" : "tasks"}</Badge>{!showDeleted ? <Badge tone="info">{tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length} active</Badge> : null}</>} />
    {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div> : null}
    {showCreate && canManage ? <Panel>
      <SectionHeading title="Create a task" />
      <form onSubmit={createTask} className="grid gap-4 md:grid-cols-2">
        <Labeled label="Task title" className="md:col-span-2"><Input required minLength={3} maxLength={160} value={form.title} onChange={e => setForm(v => ({...v,title:e.target.value}))} placeholder="What needs to be done?" /></Labeled>
        <Labeled label="Workspace"><Select required value={form.workspaceId} onChange={e => setForm(v => ({...v,workspaceId:e.target.value,projectId:"",teamId:"",workstreamId:""}))}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Labeled>
        <Labeled label="Project (optional)"><Select value={form.projectId} onChange={e => { const selected = projects.find(p => p.id === e.target.value); setForm(v => ({...v,projectId:e.target.value,teamId:selected?.teamId ?? v.teamId,workstreamId:selected?.workstreamId ?? v.workstreamId})); }}><option value="">No project</option>{projects.filter(p => p.workspaceId === form.workspaceId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Labeled>
        <Labeled label="Accountable owner"><Select required value={form.accountableUserId} onChange={e => setForm(v => ({...v,accountableUserId:e.target.value}))}>{people.map(p => <option key={p.uid} value={p.uid}>{p.displayName}</option>)}</Select></Labeled>
        <Labeled label="Team association (optional)"><Select value={form.teamId} onChange={e => setForm(v => ({...v,teamId:e.target.value}))}><option value="">No team</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Labeled>
        <Labeled label="Workstream association (optional)"><Select value={form.workstreamId} onChange={e => setForm(v => ({...v,workstreamId:e.target.value}))}><option value="">No workstream</option>{workstreams.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Labeled>
        <Labeled label="Priority"><Select value={form.priority} onChange={e => setForm(v => ({...v,priority:e.target.value as TaskPriority}))}>{priorities.map(p => <option key={p} value={p}>{label(p)}</option>)}</Select></Labeled>
        <Labeled label={`Planned start (${timeZone})`}><Input type="datetime-local" value={form.startAt} onChange={e => setForm(v => ({...v,startAt:e.target.value}))} /></Labeled>
        <Labeled label={`Due date & time (${timeZone})`}><Input type="datetime-local" value={form.dueAt} onChange={e => setForm(v => ({...v,dueAt:e.target.value}))} /></Labeled>
        <Labeled label="Description" className="md:col-span-2"><Textarea rows={3} value={form.description} onChange={e => setForm(v => ({...v,description:e.target.value}))} placeholder="Add context, scope or instructions." /></Labeled>
        <Labeled label="Acceptance criteria" className="md:col-span-2"><Textarea rows={2} value={form.acceptanceCriteria} onChange={e => setForm(v => ({...v,acceptanceCriteria:e.target.value}))} placeholder="What does done look like?" /></Labeled>
        <div className="md:col-span-2 flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-fg-3">The selected owner is accountable. Team association provides shared context and visibility.</p>
          <Button type="submit" loading={busy}>Create task</Button>
        </div>
      </form>
    </Panel> : null}
    <Panel>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeading title="Task register" count={filtered.length} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className={`${showDeleted ? "hidden" : "inline-flex"} h-9 rounded-md border border-line bg-canvas p-0.5`} aria-label="Task view">
            <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} className={`rounded px-2.5 text-xs font-semibold ${view === "list" ? "bg-surface shadow-sm" : "text-fg-3"}`}>List</button>
            <button type="button" onClick={() => setView("board")} aria-pressed={view === "board"} className={`rounded px-2.5 text-xs font-semibold ${view === "board" ? "bg-surface shadow-sm" : "text-fg-3"}`}>Board</button>
          </div>
          <label className="relative"><Search className="absolute top-2.5 left-3 size-4 text-fg-3" /><input aria-label="Search tasks" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks" className="h-9 w-full rounded-md border border-line bg-canvas pl-9 pr-3 text-sm sm:w-48" /></label>
          <label className="relative"><Filter className="absolute top-2.5 left-3 size-4 text-fg-3" /><select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 w-full rounded-md border border-line bg-canvas pl-9 pr-3 text-sm sm:w-40"><option value="all">All statuses</option>{statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
          <select aria-label="Filter by project" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="h-9 rounded-md border border-line bg-canvas px-3 text-sm sm:w-44"><option value="all">All projects</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select aria-label="Filter by priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="h-9 rounded-md border border-line bg-canvas px-3 text-sm sm:w-36"><option value="all">All priorities</option>{priorities.map(p => <option key={p} value={p}>{label(p)}</option>)}</select>
        </div>
      </div>
      {filtered.length ? (view === "list" ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead><tr className="border-b border-line text-xs text-fg-3"><th className="px-3 py-3 font-semibold">Task</th><th className="px-3 py-3 font-semibold">Owner / team</th><th className="px-3 py-3 font-semibold">Priority</th><th className="px-3 py-3 font-semibold">Due</th><th className="px-3 py-3 font-semibold">Status</th>{canManage ? <th className="px-3 py-3 font-semibold"><span className="sr-only">Actions</span></th> : null}</tr></thead>
        <tbody>{filtered.map(task => <tr key={task.id} className="border-b border-line last:border-0 hover:bg-muted/40">
          <td className="max-w-[360px] px-3 py-3">{showDeleted ? <span className="font-semibold">{task.title}</span> : <Link href={`/tasks/${task.id}`} className="font-semibold hover:underline">{task.title}</Link>}{task.description ? <p className="mt-1 line-clamp-1 text-xs text-fg-3">{task.description}</p> : null}</td>
          <td className="px-3 py-3"><p>{personName(task.accountableUserId)}</p>{task.teamId ? <p className="mt-1 text-xs text-fg-3">{teamName(task.teamId) ?? "Team"}</p> : null}</td>
          <td className="px-3 py-3"><Badge tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{label(task.priority)}</Badge></td>
          <td className="px-3 py-3 text-xs text-fg-2">{formatDateTimeInTimeZone(task.dueAt, timeZone)}</td>
          <td className="px-3 py-3"><div className="flex items-center gap-2"><Badge tone={statusTone[task.status]}>{label(task.status)}</Badge>{!showDeleted && quickTransitions(task).length ? <select aria-label={`Change status for ${task.title}`} value={task.status} onChange={e => changeStatus(task,e.target.value as TaskStatus)} className="max-w-28 rounded border border-line bg-canvas px-1.5 py-1 text-xs"><option value={task.status}>{label(task.status)}</option>{quickTransitions(task).map(next => <option key={next} value={next}>{label(next)}</option>)}</select> : null}</div></td>{canManage ? <td className="px-3 py-3"><Button size="sm" variant="ghost" className={showDeleted ? "text-accent-text" : "text-danger"} icon={showDeleted ? <ArchiveRestore /> : <Trash2 />} onClick={() => setDeleting(task)}>{showDeleted ? "Restore" : "Delete"}</Button></td> : null}
        </tr>)}</tbody>
      </table></div> : <div className="flex gap-3 overflow-x-auto pb-3">{statuses.map(status => {
        const columnTasks = filtered.filter(task => task.status === status.value);
        return <section key={status.value} className="w-[260px] shrink-0 rounded-lg border border-line bg-canvas p-3" aria-label={`${status.label} tasks`}>
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Badge tone={statusTone[status.value]}>{status.label}</Badge><span className="font-mono text-xs text-fg-3">{columnTasks.length}</span></div></div>
          <div className="grid gap-2">{columnTasks.map(task => <article key={task.id} className="rounded-lg border border-line bg-surface p-3 shadow-sm">
            {showDeleted ? <span className="text-sm font-semibold leading-snug">{task.title}</span> : <Link href={`/tasks/${task.id}`} className="text-sm font-semibold leading-snug hover:underline">{task.title}</Link>}
            <p className="mt-2 text-xs text-fg-3">{personName(task.accountableUserId)}{task.teamId ? ` · ${teamName(task.teamId) ?? "Team"}` : ""}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><Badge tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{label(task.priority)}</Badge><div className="flex items-center gap-2">{!showDeleted && quickTransitions(task).length ? <select aria-label={`Change status for ${task.title}`} value={task.status} onChange={e => changeStatus(task,e.target.value as TaskStatus)} className="max-w-28 rounded border border-line bg-canvas px-1.5 py-1 text-xs"><option value={task.status}>{label(task.status)}</option>{quickTransitions(task).map(next => <option key={next} value={next}>{label(next)}</option>)}</select> : null}{canManage ? <Button size="sm" variant="ghost" className={showDeleted ? "text-accent-text" : "text-danger"} icon={showDeleted ? <ArchiveRestore /> : <Trash2 />} onClick={() => setDeleting(task)}>{showDeleted ? "Restore" : "Delete"}</Button> : null}</div></div>
          </article>)}</div>
        </section>;
      })}</div>) : <div className="py-12 text-center"><ListTodo className="mx-auto size-8 text-fg-3" /><p className="mt-3 font-semibold">No tasks found</p><p className="mt-1 text-sm text-fg-3">{query || statusFilter !== "all" ? "Try adjusting your search or filters." : "Tasks assigned to you or shared with your teams will appear here."}</p></div>}
    </Panel>
    <ConfirmDialog
      open={!!deleting}
      onClose={() => !deleteBusy && setDeleting(null)}
      onConfirm={deleteSelectedTask}
      loading={deleteBusy}
      title={`${showDeleted ? "Restore" : "Delete"} ${deleting?.title ?? "task"}?`}
      confirmLabel={showDeleted ? "Restore task" : "Delete task"}
      tone={showDeleted ? "primary" : "danger"}
      consequence={showDeleted ? "The task will return to active task views. Its existing activity history and relationships are preserved." : "The task will be removed from active task views while its activity history is preserved. Tasks with active subtasks or dependencies must be unlinked first."}
      error={error}
    />
  </div>;
}

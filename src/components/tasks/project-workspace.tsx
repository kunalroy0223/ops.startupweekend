"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArchiveRestore, CalendarDays, ChartGantt, ChevronLeft, ChevronRight, FolderKanban, LayoutGrid, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Project, Task } from "@/domain/types";
import type { ScopeSummary } from "@/server/queries";
import { api, ApiClientError } from "@/lib/api";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { formatDateTimeInTimeZone } from "@/lib/timezone";

export function ProjectWorkspace({ initialProjects, tasks, workspaces, teams, workstreams, canManage, showArchived = false, timeZone = "Asia/Kolkata" }: {
  initialProjects: Project[]; tasks: Task[]; workspaces: { id: string; name: string }[]; teams: ScopeSummary[]; workstreams: ScopeSummary[]; canManage: boolean; showArchived?: boolean; timeZone?: string;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [archiving, setArchiving] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"projects" | "gantt" | "calendar">("projects");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "numeric" }).formatToParts(new Date());
    return { year: Number(parts.find(p => p.type === "year")?.value), month: Number(parts.find(p => p.type === "month")?.value) };
  });
  const [form, setForm] = useState({ name: "", description: "", workspaceId: workspaces[0]?.id ?? "", teamId: "", workstreamId: "" });

  function startEdit(project: Project) {
    setError(""); setOpen(false); setEditing(project); setForm({ name: project.name, description: project.description ?? "", workspaceId: project.workspaceId, teamId: project.teamId ?? "", workstreamId: project.workstreamId ?? "" });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      if (editing) await api(`/api/projects/${editing.id}`, { method: "PATCH", body: { name: form.name, description: form.description || undefined } });
      else await api("/api/projects", { method: "POST", body: { ...form, teamId: form.teamId || undefined, workstreamId: form.workstreamId || undefined, description: form.description || undefined } });
      const result = await api<{ projects: Project[] }>("/api/projects");
      setProjects(result.projects); setOpen(false); setEditing(null); setForm(v => ({ ...v, name: "", description: "" })); router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to save project."); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!archiving) return;
    setBusy(true); setError("");
    try {
      if (showArchived) await api(`/api/projects/${archiving.id}/archive`, { method: "POST", body: { archived: false } });
      else await api(`/api/projects/${archiving.id}`, { method: "DELETE" });
      setProjects(old => old.filter(p => p.id !== archiving.id)); setArchiving(null); router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : showArchived ? "Unable to restore project." : "Unable to delete project."); }
    finally { setBusy(false); }
  }
  const activeTasks = tasks.filter(task => !task.archivedAt && projects.some(project => project.id === task.projectId));
  const projectName = (id?: string) => projects.find(project => project.id === id)?.name ?? "Project";
  const dateKey = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    const partsMap = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${partsMap.year}-${partsMap.month}-${partsMap.day}`;
  };
  const monthTitle = new Intl.DateTimeFormat("en-IN", { timeZone, month: "long", year: "numeric" }).format(new Date(Date.UTC(calendarMonth.year, calendarMonth.month - 1, 15, 12)));
  const firstDay = new Date(Date.UTC(calendarMonth.year, calendarMonth.month - 1, 1));
  const daysInMonth = new Date(Date.UTC(calendarMonth.year, calendarMonth.month, 0)).getUTCDate();
  const calendarLeading = (firstDay.getUTCDay() + 6) % 7;
  const calendarDateCells = [...Array.from({ length: calendarLeading }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => new Date(Date.UTC(calendarMonth.year, calendarMonth.month - 1, index + 1)).toISOString().slice(0, 10))];
  const calendarTrailing = (7 - (calendarDateCells.length % 7)) % 7;
  const calendarCells = [...calendarDateCells, ...Array.from({ length: calendarTrailing }, () => null)];
  const eventsByDate = new Map<string, { task: Task; kind: "Starts" | "Due" }[]>();
  for (const task of activeTasks) {
    for (const event of [{ value: task.startAt, kind: "Starts" as const }, { value: task.dueAt, kind: "Due" as const }]) {
      if (!event.value || !Number.isFinite(Date.parse(event.value))) continue;
      const key = dateKey(event.value);
      eventsByDate.set(key, [...(eventsByDate.get(key) ?? []), { task, kind: event.kind }]);
    }
  }

  return <div className="min-w-0 w-full max-w-full space-y-6">
    <PageHeader eyebrow="WORK MANAGEMENT" title="Projects" description="Group related tasks into focused delivery spaces." icon={<FolderKanban />}
      actions={<div className="flex flex-wrap gap-2">{canManage ? <LinkButton href={showArchived ? "/projects" : "/projects?archived=1"} size="sm" icon={showArchived ? <FolderKanban /> : <ArchiveRestore />}>{showArchived ? "Active projects" : "Deleted projects"}</LinkButton> : null}{canManage && !showArchived ? <Button icon={open ? <X /> : <Plus />} onClick={() => { setOpen(v => !v); setEditing(null); }}>{open ? "Close" : "New project"}</Button> : null}</div>}
      meta={<Badge>{projects.length} {showArchived ? "deleted" : "projects"}</Badge>} />
    {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
    {!showArchived ? <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Project views">
      <button type="button" onClick={() => setView("projects")} aria-pressed={view === "projects"} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${view === "projects" ? "border-line-strong bg-surface text-fg" : "border-line bg-canvas text-fg-2 hover:text-fg"}`}><LayoutGrid className="size-4" />Projects</button>
      <button type="button" onClick={() => setView("gantt")} aria-pressed={view === "gantt"} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${view === "gantt" ? "border-line-strong bg-surface text-fg" : "border-line bg-canvas text-fg-2 hover:text-fg"}`}><ChartGantt className="size-4" />Gantt</button>
      <button type="button" onClick={() => setView("calendar")} aria-pressed={view === "calendar"} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${view === "calendar" ? "border-line-strong bg-surface text-fg" : "border-line bg-canvas text-fg-2 hover:text-fg"}`}><CalendarDays className="size-4" />Calendar</button>
    </div> : null}
    {open && canManage ? <Panel><SectionHeading title="Create project" /><form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Project name<Input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder="e.g. Website redesign" /></label>
      <label className="grid gap-1.5 text-[13px] font-semibold">Workspace<Select required value={form.workspaceId} onChange={e => setForm(v => ({ ...v, workspaceId: e.target.value }))}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
      <label className="grid gap-1.5 text-[13px] font-semibold">Team association (optional)<Select value={form.teamId} onChange={e => setForm(v => ({ ...v, teamId: e.target.value }))}><option value="">No team</option>{teams.filter(t => t.workspaceId === form.workspaceId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
      <label className="grid gap-1.5 text-[13px] font-semibold">Workstream association (optional)<Select value={form.workstreamId} onChange={e => setForm(v => ({ ...v, workstreamId: e.target.value }))}><option value="">No workstream</option>{workstreams.filter(w => w.workspaceId === form.workspaceId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
      <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Description<Textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} placeholder="What outcome does this project support?" /></label>
      <div className="md:col-span-2 flex justify-end"><Button type="submit" loading={busy}>Create project</Button></div>
    </form></Panel> : null}
    {view === "projects" || showArchived ? (projects.length ? <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{projects.map(project => {
      const projectTasks = tasks.filter(task => task.projectId === project.id);
      const completed = projectTasks.filter(task => task.status === "completed").length;
      return <Panel key={project.id} className="space-y-3">
      <div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-text"><FolderKanban className="size-4" /></span><Badge tone={showArchived ? "neutral" : "success"}>{showArchived ? "Deleted" : "Active"}</Badge></div>
      <div><h2 className="font-bold">{project.name}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm text-fg-2">{project.description || "No project description."}</p></div>
      <p className="text-xs text-fg-3">{workspaces.find(w => w.id === project.workspaceId)?.name ?? "Workspace"}{project.teamId ? ` · ${teams.find(t => t.id === project.teamId)?.name ?? "Team"}` : ""}{project.workstreamId ? ` · ${workstreams.find(w => w.id === project.workstreamId)?.name ?? "Workstream"}` : ""}</p>
      <div className="flex items-center justify-between text-xs text-fg-2"><span>{completed} of {projectTasks.length} tasks completed</span><span>{projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${projectTasks.length ? completed / projectTasks.length * 100 : 0}%` }} /></div>
      {!showArchived ? <Link href={`/tasks?project=${encodeURIComponent(project.id)}`} className="inline-flex text-xs font-semibold text-accent-text hover:underline">View project tasks</Link> : null}
      {canManage ? <div className="flex gap-2 border-t border-line pt-3">{!showArchived ? <><Button size="sm" variant="secondary" icon={<Pencil />} onClick={() => startEdit(project)}>Edit</Button><Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 />} onClick={() => setArchiving(project)}>Delete</Button></> : <Button size="sm" variant="secondary" icon={<ArchiveRestore />} onClick={() => setArchiving(project)}>Restore</Button>}</div> : null}
    </Panel>})}</div> : <Panel className="py-12 text-center"><FolderKanban className="mx-auto size-8 text-fg-3" /><p className="mt-3 font-semibold">No projects yet</p><p className="mt-1 text-sm text-fg-3">Create a project to organise related tasks.</p></Panel>) : null}
    {view === "gantt" && !showArchived ? <Panel className="min-w-0"><SectionHeading title="Project Gantt" count={activeTasks.length} />
      <p className="mb-4 text-xs text-fg-2">Task bars use the planned start and due dates saved on each task. Tasks with only one of those dates appear as a milestone marker; unscheduled tasks are not assigned invented dates.</p>
      {activeTasks.length ? (() => {
        const scheduled = activeTasks.map(task => {
          const startValue = task.startAt ?? task.dueAt;
          const endValue = task.dueAt ?? task.startAt;
          const start = startValue ? Date.parse(startValue) : Number.NaN;
          const end = endValue ? Date.parse(endValue) : Number.NaN;
          return { task, start, end };
        }).filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start).sort((a,b) => a.start - b.start);
        const unscheduled = activeTasks.length - scheduled.length;
        if (!scheduled.length) return <p className="py-10 text-center text-sm text-fg-3">No project tasks have planned start or due dates yet. Add dates to tasks to build the Gantt timeline.</p>;
        const min = Math.min(...scheduled.map(item => item.start));
        const max = Math.max(...scheduled.map(item => item.end), min + 7 * 86_400_000);
        const span = Math.max(max - min, 7 * 86_400_000);
        const ticks = Array.from({ length: 5 }, (_, index) => min + (span * index / 4));
        return <div className="min-w-0 space-y-2">
          {unscheduled ? <p className="text-xs text-fg-3">{unscheduled} task{unscheduled === 1 ? "" : "s"} without valid schedule dates omitted from this timeline.</p> : null}
          <div className="max-w-full overflow-x-auto rounded-lg border border-line">
            <div className="min-w-[760px]">
            <div className="grid grid-cols-[240px_minmax(500px,1fr)] border-b border-line bg-muted text-[10px] font-mono uppercase tracking-wide text-fg-3"><div className="px-3 py-3">Task / project</div><div className="relative px-3 py-3">{ticks.map((tick,index)=><span key={index} className="absolute top-3 -translate-x-1/2 whitespace-nowrap" style={{left:`${index*25}%`}}>{new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",timeZone}).format(new Date(tick))}</span>)}</div></div>
            {scheduled.map(({task,start,end}) => {
              const left = ((start-min)/span)*100;
              const width = Math.max(((end-start)/span)*100, 1.2);
              const done = task.status === "completed";
              return <div key={task.id} className="grid grid-cols-[240px_minmax(500px,1fr)] border-b border-line last:border-0">
                <div className="min-w-0 px-3 py-3"><Link href={`/tasks/${task.id}`} className="block truncate text-xs font-semibold hover:underline">{task.title}</Link><p className="mt-1 truncate text-[10px] text-fg-3">{projectName(task.projectId)} · {task.status.replaceAll("_"," ")}</p></div>
                <div className="relative flex items-center px-3 py-3"><div className="absolute inset-y-0 left-0 right-0 grid grid-cols-4 divide-x divide-line/60">{Array.from({length:4},(_,i)=><span key={i}/>)}</div><span className={`relative z-[1] block h-3.5 min-w-[8px] rounded-full ${done ? "bg-success" : task.status === "blocked" ? "bg-danger" : task.status === "cancelled" ? "bg-[var(--border-strong)]" : "bg-accent"}`} style={{marginLeft:`${left}%`,width:`${width}%`}} title={`${task.title}: ${formatDateTimeInTimeZone(new Date(start).toISOString(),timeZone)} → ${formatDateTimeInTimeZone(new Date(end).toISOString(),timeZone)}`}/></div>
              </div>;
            })}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-fg-2">
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-accent" />Open / in progress</span>
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-success" />Completed</span>
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-danger" />Blocked</span>
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-[var(--border-strong)]" />Cancelled</span>
          </div>
        </div>;
      })() : <p className="py-10 text-center text-sm text-fg-3">Create project tasks to see the Gantt timeline.</p>}
    </Panel> : null}
    {view === "calendar" && !showArchived ? <Panel className="min-w-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><SectionHeading title="Project calendar" /><div className="flex items-center gap-2"><button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(value => value.month === 1 ? {year:value.year-1,month:12} : {year:value.year,month:value.month-1})} className="grid size-8 place-items-center rounded-md border border-line hover:bg-muted"><ChevronLeft className="size-4" /></button><span className="min-w-32 text-center text-sm font-semibold">{monthTitle}</span><button type="button" aria-label="Next month" onClick={() => setCalendarMonth(value => value.month === 12 ? {year:value.year+1,month:1} : {year:value.year,month:value.month+1})} className="grid size-8 place-items-center rounded-md border border-line hover:bg-muted"><ChevronRight className="size-4" /></button></div></div>
      <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase text-fg-3">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day=><span key={day} className="py-2">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">{calendarCells.map((date,index) => {
        const events = date ? eventsByDate.get(date) ?? [] : [];
        const today = date === dateKey(new Date().toISOString());
        return <div key={date ?? `blank-${index}`} className={`min-h-24 min-w-0 rounded-md border p-1.5 sm:min-h-32 sm:p-2 ${date ? "border-line bg-canvas" : "border-transparent"} ${today ? "ring-1 ring-accent" : ""}`}>
          {date ? <><span className={`font-mono text-xs ${today ? "font-bold text-accent-text" : "text-fg-2"}`}>{Number(date.slice(-2))}</span><div className="mt-1 grid gap-1">{events.slice(0,3).map((event,i)=><Link key={`${event.task.id}-${event.kind}-${i}`} href={`/tasks/${event.task.id}`} className={`block min-w-0 truncate rounded px-1 py-1 text-[9px] leading-tight sm:text-[10px] ${event.kind === "Due" ? "bg-info-soft text-info" : "bg-accent-soft text-accent-text"}`} title={`${event.kind}: ${event.task.title}`}>{event.kind === "Due" ? "Due · " : "Start · "}{event.task.title}</Link>)}{events.length>3 ? <span className="text-[9px] text-fg-3">+{events.length-3} more</span> : null}</div></> : null}
        </div>;
      })}</div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-fg-2"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-accent" />Planned start</span><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-info" />Due date</span></div>
      {!activeTasks.some(task => task.startAt || task.dueAt) ? <p className="mt-4 text-center text-sm text-fg-3">Create project tasks with planned start dates or due dates to populate the calendar.</p> : !calendarCells.some(date => date && (eventsByDate.get(date)?.length ?? 0) > 0) ? <p className="mt-4 text-center text-sm text-fg-3">No project tasks are scheduled in this month.</p> : null}
    </Panel> : null}
    <Dialog open={!!editing} onClose={() => { setEditing(null); setError(""); }} title="Edit project" description="Update its name and project context." footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="project-edit-form" loading={busy}>Save changes</Button></>}>
      <form id="project-edit-form" onSubmit={submit} className="grid gap-4"><label className="grid gap-1.5 text-[13px] font-semibold">Project name<Input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} /></label><label className="grid gap-1.5 text-[13px] font-semibold">Description<Textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} /></label>{error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}</form>
    </Dialog>
    <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} onConfirm={archive} title={`${showArchived ? "Restore" : "Delete"} ${archiving?.name ?? "project"}?`} consequence={showArchived ? "The project will return to active project views. Existing tasks and project history are preserved." : "The project will be removed from active project views. Existing tasks and project history are preserved."} confirmLabel={showArchived ? "Restore project" : "Delete project"} tone={showArchived ? "primary" : "danger"} loading={busy} error={error} />
  </div>;
}

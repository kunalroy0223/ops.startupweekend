"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, FolderKanban, Pencil, Plus, X } from "lucide-react";
import type { Project, Task } from "@/domain/types";
import type { ScopeSummary } from "@/server/queries";
import { api, ApiClientError } from "@/lib/api";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";

export function ProjectWorkspace({ initialProjects, tasks, workspaces, teams, workstreams, canManage }: {
  initialProjects: Project[]; tasks: Task[]; workspaces: { id: string; name: string }[]; teams: ScopeSummary[]; workstreams: ScopeSummary[]; canManage: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [archiving, setArchiving] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      await api(`/api/projects/${archiving.id}/archive`, { method: "POST", body: { archived: true } });
      setProjects(old => old.filter(p => p.id !== archiving.id)); setArchiving(null); router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to archive project."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <PageHeader eyebrow="WORK MANAGEMENT" title="Projects" description="Group related tasks into focused delivery spaces." icon={<FolderKanban />}
      actions={canManage ? <Button icon={open ? <X /> : <Plus />} onClick={() => { setOpen(v => !v); setEditing(null); }}>{open ? "Close" : "New project"}</Button> : undefined}
      meta={<Badge>{projects.length} projects</Badge>} />
    {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
    {open && canManage ? <Panel><SectionHeading title="Create project" /><form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Project name<Input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder="e.g. Website redesign" /></label>
      <label className="grid gap-1.5 text-[13px] font-semibold">Workspace<Select required value={form.workspaceId} onChange={e => setForm(v => ({ ...v, workspaceId: e.target.value }))}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
      <label className="grid gap-1.5 text-[13px] font-semibold">Team association (optional)<Select value={form.teamId} onChange={e => setForm(v => ({ ...v, teamId: e.target.value }))}><option value="">No team</option>{teams.filter(t => t.workspaceId === form.workspaceId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
      <label className="grid gap-1.5 text-[13px] font-semibold">Workstream association (optional)<Select value={form.workstreamId} onChange={e => setForm(v => ({ ...v, workstreamId: e.target.value }))}><option value="">No workstream</option>{workstreams.filter(w => w.workspaceId === form.workspaceId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
      <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Description<Textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} placeholder="What outcome does this project support?" /></label>
      <div className="md:col-span-2 flex justify-end"><Button type="submit" loading={busy}>Create project</Button></div>
    </form></Panel> : null}
    {projects.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{projects.map(project => {
      const projectTasks = tasks.filter(task => task.projectId === project.id);
      const completed = projectTasks.filter(task => task.status === "completed").length;
      return <Panel key={project.id} className="space-y-3">
      <div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-text"><FolderKanban className="size-4" /></span><Badge tone="success">Active</Badge></div>
      <div><h2 className="font-bold">{project.name}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm text-fg-2">{project.description || "No project description."}</p></div>
      <p className="text-xs text-fg-3">{workspaces.find(w => w.id === project.workspaceId)?.name ?? "Workspace"}{project.teamId ? ` · ${teams.find(t => t.id === project.teamId)?.name ?? "Team"}` : ""}{project.workstreamId ? ` · ${workstreams.find(w => w.id === project.workstreamId)?.name ?? "Workstream"}` : ""}</p>
      <div className="flex items-center justify-between text-xs text-fg-2"><span>{completed} of {projectTasks.length} tasks completed</span><span>{projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${projectTasks.length ? completed / projectTasks.length * 100 : 0}%` }} /></div>
      <Link href={`/tasks?project=${encodeURIComponent(project.id)}`} className="inline-flex text-xs font-semibold text-accent-text hover:underline">View project tasks</Link>
      {canManage ? <div className="flex gap-2 border-t border-line pt-3"><Button size="sm" variant="secondary" icon={<Pencil />} onClick={() => startEdit(project)}>Edit</Button><Button size="sm" variant="ghost" icon={<Archive />} onClick={() => setArchiving(project)}>Archive</Button></div> : null}
    </Panel>})}</div> : <Panel className="py-12 text-center"><FolderKanban className="mx-auto size-8 text-fg-3" /><p className="mt-3 font-semibold">No projects yet</p><p className="mt-1 text-sm text-fg-3">Create a project to organise related tasks.</p></Panel>}

    <Dialog open={!!editing} onClose={() => { setEditing(null); setError(""); }} title="Edit project" description="Update its name and project context." footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="project-edit-form" loading={busy}>Save changes</Button></>}>
      <form id="project-edit-form" onSubmit={submit} className="grid gap-4"><label className="grid gap-1.5 text-[13px] font-semibold">Project name<Input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} /></label><label className="grid gap-1.5 text-[13px] font-semibold">Description<Textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} /></label>{error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}</form>
    </Dialog>
    <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} onConfirm={archive} title={`Archive ${archiving?.name ?? "project"}?`} consequence="The project will leave the active project list. Existing tasks and their history remain available." confirmLabel="Archive project" tone="danger" loading={busy} error={error} />
  </div>;
}

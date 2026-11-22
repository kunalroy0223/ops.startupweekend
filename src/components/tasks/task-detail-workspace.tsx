"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, MessageSquare, Save, Send, Trash2 } from "lucide-react";
import type { Project, Task, TaskComment, TaskPriority, TaskStatus } from "@/domain/types";
import type { PublicUser, ScopeSummary } from "@/server/queries";
import type { TaskActivityItem } from "@/server/services/task-collaboration";
import { api, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/dialog";
import { dateTimeInputInTimeZone, dateTimeToIso, formatDateTimeInTimeZone } from "@/lib/timezone";

const priorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const TASK_TONES = { backlog: "neutral", assigned: "info", in_progress: "accent", in_review: "warning", completed: "success", blocked: "danger", cancelled: "neutral" } as const;
const tone = (status: TaskStatus) => TASK_TONES[status];
export function TaskDetailWorkspace({ currentUserId, task, comments, activity, people, canManage, canUpdateStatus, availableTasks, projects, teams, workstreams, timeZone }: {
  currentUserId: string; task: Task; comments: (TaskComment & { authorName?: string })[]; activity: TaskActivityItem[]; people: PublicUser[]; canManage: boolean; canUpdateStatus: boolean; availableTasks: Task[]; projects: Project[]; teams: ScopeSummary[]; workstreams: ScopeSummary[]; timeZone: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [criteria, setCriteria] = useState(task.acceptanceCriteria ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [owner, setOwner] = useState(task.accountableUserId);
  const [collaborators, setCollaborators] = useState(task.collaboratorUserIds ?? []);
  const [startAt, setStartAt] = useState(dateTimeInputInTimeZone(task.startAt, timeZone));
  const [dueAt, setDueAt] = useState(dateTimeInputInTimeZone(task.dueAt, timeZone));
  const [teamId, setTeamId] = useState(task.teamId ?? "");
  const [workstreamId, setWorkstreamId] = useState(task.workstreamId ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [parentTaskId, setParentTaskId] = useState(task.parentTaskId ?? "");
  const [dependencyIds, setDependencyIds] = useState(task.dependencyIds ?? []);
  const [referenceLinks, setReferenceLinks] = useState((task.referenceLinks ?? []).join("\n"));
  const [comment, setComment] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [nextStatus, setNextStatus] = useState<TaskStatus>(task.status);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<TaskComment | null>(null);

  const ownerName = people.find(p => p.uid === task.accountableUserId)?.displayName ?? "Assigned user";
  const needsReason = nextStatus === "cancelled" || task.status === "completed" || task.status === "cancelled";
  const managerTransitions: Record<TaskStatus, TaskStatus[]> = {
    backlog: ["assigned", "cancelled"], assigned: ["backlog", "in_progress", "cancelled"],
    in_progress: ["in_review", "blocked", "cancelled"], in_review: ["in_progress", "completed", "cancelled"],
    completed: ["in_progress"], blocked: ["in_progress"], cancelled: ["in_progress"],
  };
  const memberTransitions: Record<TaskStatus, TaskStatus[]> = {
    backlog: [], assigned: ["in_progress"], in_progress: ["in_review", "blocked"],
    in_review: [], completed: [], blocked: ["in_progress"], cancelled: [],
  };
  const statusOptions = canManage ? managerTransitions[task.status] : canUpdateStatus ? memberTransitions[task.status] : [];

  async function saveTask(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const startAtIso = startAt ? dateTimeToIso(startAt, timeZone) : null;
    const dueAtIso = dueAt ? dateTimeToIso(dueAt, timeZone) : null;
    if (startAt && !startAtIso) { setError("That planned start is not valid in the organisation timezone. Choose another time."); return; }
    if (dueAt && !dueAtIso) { setError("That date and time is not valid in the organisation timezone. Choose another time."); return; }
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: {
        title, description, acceptanceCriteria: criteria,
        priority, accountableUserId: owner, collaboratorUserIds: collaborators,
        startAt: startAtIso, dueAt: dueAtIso,
        teamId: teamId || null, workstreamId: workstreamId || null, projectId: projectId || null,
        parentTaskId: parentTaskId || null, dependencyIds,
        referenceLinks: referenceLinks.split("\n").map(v => v.trim()).filter(Boolean),
      }});
      setEditing(false); router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to save task details."); }
    finally { setBusy(false); }
  }

  async function updateStatus(e: React.FormEvent) {
    e.preventDefault(); if (nextStatus === task.status) return;
    if (needsReason && !reason.trim()) { setError("Enter a reason for this status change."); return; }
    setBusy(true); setError("");
    try { await api(`/api/tasks/${task.id}/status`, { method: "POST", body: { status: nextStatus, reason: reason.trim() || undefined } }); router.refresh(); }
    catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to change task status."); }
    finally { setBusy(false); }
  }

  async function deleteTask() {
    setBusy(true); setError("");
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      router.push("/tasks");
      router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to delete task."); }
    finally { setBusy(false); }
  }

  async function deleteSelectedComment() {
    if (!commentToDelete) return;
    setBusy(true); setError("");
    try {
      await api(`/api/tasks/${task.id}/comments/${commentToDelete.id}`, { method: "DELETE" });
      setCommentToDelete(null);
      router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to delete comment."); }
    finally { setBusy(false); }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await api(`/api/tasks/${task.id}/comments`, { method: "POST", body: { body: comment, mentionedUserIds: mentionIds } }); setComment(""); setMentionIds([]); router.refresh(); }
    catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to add comment."); }
    finally { setBusy(false); }
  }


  return <div className="space-y-6">
    <PageHeader eyebrow="TASK DETAIL" title={task.title} description={task.description || "Task context and delivery details."} icon={<FileText />}
      actions={<div className="flex flex-wrap gap-2"><LinkButton href="/tasks" icon={<ArrowLeft />}>All tasks</LinkButton>{canManage ? <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>Delete task</Button> : null}</div>}
      meta={<><Badge tone={tone(task.status)}>{label(task.status)}</Badge><Badge tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{label(task.priority)} priority</Badge><Badge>{ownerName}</Badge></>} />
    {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
      <div className="space-y-5">
        <Panel>
          <div className="mb-4 flex items-center justify-between"><SectionHeading title="Task details" /><div className="flex gap-2">{canManage && !editing ? <Button size="sm" onClick={() => setEditing(true)}>Edit details</Button> : null}{editing ? <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button> : null}</div></div>
          {editing ? <form onSubmit={saveTask} className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Title<Input required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} /></label>
            <label className="grid gap-1.5 text-[13px] font-semibold">Accountable owner<Select value={owner} onChange={e=>setOwner(e.target.value)}>{people.filter(p=>p.status==="active").map(p=><option key={p.uid} value={p.uid}>{p.displayName}</option>)}</Select></label>
            <label className="grid gap-1.5 text-[13px] font-semibold">Priority<Select value={priority} onChange={e=>setPriority(e.target.value as TaskPriority)}>{priorities.map(p=><option key={p} value={p}>{label(p)}</option>)}</Select></label>
            <label className="grid gap-1.5 text-[13px] font-semibold">Planned start ({timeZone})<Input type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)} /></label>
            <label className="grid gap-1.5 text-[13px] font-semibold">Due date & time ({timeZone})<Input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} /></label>
            <label className="grid gap-1.5 text-[13px] font-semibold">Team association<Select value={teamId} onChange={e=>setTeamId(e.target.value)}><option value="">No team</option>{teams.filter(t=>t.workspaceId===task.workspaceId).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
            <label className="grid gap-1.5 text-[13px] font-semibold">Workstream association<Select value={workstreamId} onChange={e=>setWorkstreamId(e.target.value)}><option value="">No workstream</option>{workstreams.filter(w=>w.workspaceId===task.workspaceId).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
            <label className="grid gap-1.5 text-[13px] font-semibold">Project<Select value={projectId} onChange={e=>{const selected=projects.find(p=>p.id===e.target.value);setProjectId(e.target.value);if(selected?.teamId)setTeamId(selected.teamId);if(selected?.workstreamId)setWorkstreamId(selected.workstreamId);}}><option value="">No project</option>{projects.filter(p=>p.workspaceId===task.workspaceId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
            <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Parent task <span className="font-normal text-fg-3">(optional; this makes the task a subtask)</span><Select value={parentTaskId} onChange={e=>setParentTaskId(e.target.value)}><option value="">No parent</option>{availableTasks.filter(t=>t.workspaceId===task.workspaceId&&t.id!==task.id).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</Select></label>
            <div className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Collaborators<div className="grid gap-1 rounded-lg border border-line p-2 sm:grid-cols-2">{people.filter(p=>p.status==="active"&&p.uid!==owner).map(p=><label key={p.uid} className="flex items-center gap-2 px-2 py-1 text-xs font-normal"><input type="checkbox" checked={collaborators.includes(p.uid)} onChange={e=>setCollaborators(old=>e.target.checked?[...old,p.uid]:old.filter(id=>id!==p.uid))} />{p.displayName}</label>)}</div></div>
            <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Description<Textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} /></label>
            <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Acceptance criteria<Textarea rows={2} value={criteria} onChange={e=>setCriteria(e.target.value)} /></label>
            <div className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Dependencies <span className="font-normal text-fg-3">(select the tasks this task depends on)</span><div className="grid gap-1 rounded-lg border border-line p-2 sm:grid-cols-2">{availableTasks.filter(t=>t.workspaceId===task.workspaceId&&t.id!==task.id).map(t=><label key={t.id} className="flex items-center gap-2 px-2 py-1 text-xs font-normal"><input type="checkbox" checked={dependencyIds.includes(t.id)} onChange={e=>setDependencyIds(old=>e.target.checked?[...old,t.id]:old.filter(id=>id!==t.id))}/>{t.title}</label>)}</div></div>
            <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Documents & reference links <span className="font-normal text-fg-3">(one URL per line; for example, a shared Drive document)</span><Textarea rows={2} value={referenceLinks} onChange={e=>setReferenceLinks(e.target.value)} placeholder="https://drive.google.com/..." /><span className="text-xs font-normal text-fg-3">Only the reference URL is stored in Firestore. Keep the file in your approved document storage and check its sharing permissions.</span></label>
            <div className="md:col-span-2 flex justify-end"><Button type="submit" loading={busy} icon={<Save />}>Save task</Button></div>
          </form> : <div className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{task.description || "No description provided."}</p>
            <div className="rounded-lg bg-canvas p-3"><p className="text-xs font-bold uppercase tracking-wide text-fg-3">Acceptance criteria</p><p className="mt-2 whitespace-pre-wrap text-sm">{task.acceptanceCriteria || "No acceptance criteria recorded."}</p></div>
            <div className="rounded-lg border border-line p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-fg-3">Task relationships</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs text-fg-3">Parent task</p>{task.parentTaskId ? <Link href={`/tasks/${task.parentTaskId}`} className="text-sm font-semibold text-accent-text hover:underline">{availableTasks.find(t=>t.id===task.parentTaskId)?.title ?? "Open parent task"}</Link> : <p className="text-sm">No parent task</p>}</div>
                <div><p className="text-xs text-fg-3">Subtasks</p>{availableTasks.some(t=>t.parentTaskId===task.id) ? <div className="mt-1 grid gap-1">{availableTasks.filter(t=>t.parentTaskId===task.id).map(t=><Link key={t.id} href={`/tasks/${t.id}`} className="text-sm font-semibold text-accent-text hover:underline">{t.title}</Link>)}</div> : <p className="text-sm">No subtasks</p>}</div>
                <div className="sm:col-span-2"><p className="text-xs text-fg-3">Depends on</p>{task.dependencyIds?.length ? <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{task.dependencyIds.map(id=><Link key={id} href={`/tasks/${id}`} className="text-sm font-semibold text-accent-text hover:underline">{availableTasks.find(t=>t.id===id)?.title ?? "Open dependency"}</Link>)}</div> : <p className="text-sm">No dependencies</p>}</div>
              </div>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs text-fg-3">Accountable owner</p><p className="font-semibold">{ownerName}</p></div><div><p className="text-xs text-fg-3">Collaborators</p><p>{task.collaboratorUserIds.map(id=>people.find(p=>p.uid===id)?.displayName??"Teammate").join(", ") || "None"}</p></div><div><p className="text-xs text-fg-3">Planned start</p><p>{task.startAt ? formatDateTimeInTimeZone(task.startAt, timeZone) : "Not scheduled"}</p></div><div><p className="text-xs text-fg-3">Due date</p><p>{task.dueAt ? formatDateTimeInTimeZone(task.dueAt, timeZone) : "No due date"}</p></div><div><p className="text-xs text-fg-3">Created</p><p>{formatDateTimeInTimeZone(task.createdAt, timeZone)}</p></div><div><p className="text-xs text-fg-3">Team</p><p>{teams.find(t=>t.id===task.teamId)?.name ?? (task.teamId ? "Associated team" : "No team association")}</p></div><div><p className="text-xs text-fg-3">Workstream</p><p>{workstreams.find(w=>w.id===task.workstreamId)?.name ?? (task.workstreamId ? "Associated workstream" : "No workstream association")}</p></div><div><p className="text-xs text-fg-3">Project</p><p>{projects.find(p=>p.id===task.projectId)?.name ?? (task.projectId ? "Project" : "No project")}</p></div></div>
            {task.referenceLinks?.length ? <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-3">Documents & reference links</p><div className="flex flex-wrap gap-3">{task.referenceLinks.map(url=><a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline"><ExternalLink className="size-3.5" />{new URL(url).hostname}</a>)}</div></div> : null}
          </div>}
        </Panel>


        <Panel><SectionHeading title="Comments" count={comments.length} icon={<MessageSquare />} />
          <div className="space-y-3">{comments.length ? comments.map(c=><article key={c.id} className="rounded-lg border border-line p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{c.authorName ?? (c.authorUserId===task.createdBy?"Task creator":"Teammate")}</p><time className="text-xs text-fg-3">{new Date(c.createdAt).toLocaleString("en-IN")}</time></div>{c.authorUserId === currentUserId || canManage ? <Button size="sm" variant="ghost" className="shrink-0 text-danger" icon={<Trash2 />} onClick={() => setCommentToDelete(c)} aria-label="Delete comment" /> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>{c.mentionedUserIds.length?<p className="mt-2 text-xs text-fg-3">Mentioned: {c.mentionedUserIds.map(id=>people.find(p=>p.uid===id)?.displayName??"Teammate").join(", ")}</p>:null}</article>) : <p className="text-sm text-fg-3">No comments yet.</p>}</div>
          <form onSubmit={addComment} className="mt-4 grid gap-3 border-t border-line pt-4"><label className="grid gap-1.5 text-[13px] font-semibold">Add a comment<Textarea required minLength={1} maxLength={5000} rows={3} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Share an update or ask a question." /></label><div><p className="mb-2 text-xs font-semibold text-fg-2">Mention people with task access</p><div className="grid gap-1 sm:grid-cols-2">{people.filter(p=>p.status==="active"&&p.uid!==task.createdBy).map(p=><label key={p.uid} className="flex items-center gap-2 text-xs text-fg-2"><input type="checkbox" checked={mentionIds.includes(p.uid)} onChange={e=>setMentionIds(old=>e.target.checked?[...old,p.uid]:old.filter(id=>id!==p.uid))}/>{p.displayName}</label>)}</div></div><div className="flex justify-end"><Button type="submit" loading={busy} icon={<Send />}>Post comment</Button></div></form>
        </Panel>
      </div>
      <div className="space-y-5">
        <Panel><SectionHeading title="Update status" />{statusOptions.length ? <form onSubmit={updateStatus} className="grid gap-3"><Select value={nextStatus} onChange={e=>{setNextStatus(e.target.value as TaskStatus);setReason("");}}>{[task.status,...statusOptions].map(s=><option key={s} value={s}>{label(s)}</option>)}</Select>{needsReason && nextStatus!==task.status?<label className="grid gap-1.5 text-[13px] font-semibold">Reason<Textarea required rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why this task is being cancelled or reopened." /></label>:null}<Button type="submit" loading={busy} disabled={nextStatus===task.status}>Save status</Button></form> : <p className="text-sm text-fg-3">No status change is available for your access or the task&apos;s current state.</p>}</Panel>
        <Panel><SectionHeading title="Task activity" count={activity.length} />{activity.length ? <div className="space-y-3">{activity.map(item=><div key={item.id} className="border-l-2 border-line-strong pl-3"><p className="text-sm">{item.summary}</p><p className="mt-1 text-xs text-fg-3">{new Date(item.createdAt).toLocaleString("en-IN")}</p></div>)}</div> : <p className="text-sm text-fg-3">Task activity appears here as the work changes.</p>}</Panel>
        <Panel><SectionHeading title="Task links" /><div className="grid gap-2 text-sm"><Link href="/tasks" className="font-semibold text-accent-text hover:underline">Back to task register</Link><Link href="/projects" className="font-semibold text-accent-text hover:underline">Open projects</Link><Link href="/reports" className="font-semibold text-accent-text hover:underline">Open work reports</Link></div></Panel>
      </div>
    </div>
    <ConfirmDialog open={!!commentToDelete} onClose={() => !busy && setCommentToDelete(null)} onConfirm={deleteSelectedComment} loading={busy} error={error} tone="danger" title="Delete this comment?" confirmLabel="Delete comment" consequence="The comment will be removed from the task discussion. Its deletion remains recorded in the task activity and audit history." />
    <ConfirmDialog open={confirmDelete} onClose={() => !busy && setConfirmDelete(false)} onConfirm={deleteTask} loading={busy} error={error} tone="danger" title={`Delete ${task.title}?`} confirmLabel="Delete task" consequence="The task will be removed from active task views while its activity and audit history are preserved. Active subtasks or dependent tasks must be unlinked first." />
  </div>;
}

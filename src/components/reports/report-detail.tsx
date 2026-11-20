"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, FileText, Plus, Send, Trash2 } from "lucide-react";
import type { Task, WorkReport, WorkReportEntry, WorkReportReview, WorkReportVersion } from "@/domain/types";
import { api, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/dialog";

type EntryForm = {
  taskId: string; activityTitle: string; workCompleted: string; progressSummary: string;
  timeSpentMinutes: string; blockers: string; nextSteps: string; linkUrls: string;
};
const emptyEntry = (): EntryForm => ({ taskId: "", activityTitle: "", workCompleted: "", progressSummary: "", timeSpentMinutes: "", blockers: "", nextSteps: "", linkUrls: "" });
const statusLabel = (status: WorkReport["status"]) => ({ draft: "Draft", submitted: "Submitted", needs_revision: "Needs revision", approved: "Approved" })[status];
const REPORT_STATUS_TONE: Record<WorkReport["status"], "neutral" | "info" | "warning" | "success"> = {
  draft: "neutral",
  submitted: "info",
  needs_revision: "warning",
  approved: "success",
};
const tone = (status: WorkReport["status"]) => REPORT_STATUS_TONE[status];
const fmtWhen = (value?: string) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const lines = (value: string) => value.split("\n").map(x => x.trim()).filter(Boolean);

function toForm(entry?: WorkReportEntry): EntryForm {
  return entry ? {
    taskId: entry.taskId ?? "", activityTitle: entry.activityTitle, workCompleted: entry.workCompleted,
    progressSummary: entry.progressSummary ?? "", timeSpentMinutes: entry.timeSpentMinutes === undefined ? "" : String(entry.timeSpentMinutes),
    blockers: entry.blockers.join("\n"), nextSteps: entry.nextSteps.join("\n"), linkUrls: entry.linkUrls.join("\n"),
  } : emptyEntry();
}

export function ReportDetail({ report, initialEntries, reviews, versions, authorDisplayName, isAuthor, canEdit, canReview, tasks, scopeNames }: {
  report: WorkReport; initialEntries: WorkReportEntry[]; reviews: (WorkReportReview & { reviewerDisplayName: string })[]; versions: WorkReportVersion[];
  authorDisplayName: string; isAuthor: boolean; canEdit: boolean; canReview: boolean; tasks: Task[]; scopeNames: string[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [form, setForm] = useState<EntryForm>(emptyEntry());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEntryForm, setShowEntryForm] = useState(canEdit && initialEntries.length === 0);
  const [reviewComment, setReviewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const totalMinutes = useMemo(() => entries.reduce((sum, e) => sum + (e.timeSpentMinutes ?? 0), 0), [entries]);

  async function saveEntry(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const input = {
      taskId: form.taskId || undefined,
      activityTitle: form.activityTitle,
      workCompleted: form.workCompleted,
      progressSummary: form.progressSummary || undefined,
      timeSpentMinutes: form.timeSpentMinutes === "" ? undefined : Number(form.timeSpentMinutes),
      blockers: lines(form.blockers), nextSteps: lines(form.nextSteps), linkUrls: lines(form.linkUrls),
    };
    try {
      if (editingId) await api(`/api/reports/${report.id}/entries/${editingId}`, { method: "PATCH", body: input });
      else await api(`/api/reports/${report.id}/entries`, { method: "POST", body: input });
      setForm(emptyEntry()); setEditingId(null); setShowEntryForm(false); router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to save this work entry."); }
    finally { setBusy(false); }
  }


  async function removeEntry() {
    if (!deleteTarget) return;
    const entryId = deleteTarget;
    setBusy(true); setError("");
    try { await api(`/api/reports/${report.id}/entries/${entryId}`, { method: "DELETE" }); setEntries(old => old.filter(e => e.id !== entryId)); setDeleteTarget(null); router.refresh(); }
    catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to delete this entry."); }
    finally { setBusy(false); }
  }

  async function submitReport() {
    setBusy(true); setError("");
    try { await api(`/api/reports/${report.id}/submit`, { method: "POST", body: {} }); router.refresh(); }
    catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to submit this report."); }
    finally { setBusy(false); }
  }

  async function review(decision: "approved" | "needs_revision") {
    setBusy(true); setError("");
    try {
      await api(`/api/reports/${report.id}/review`, { method: "POST", body: { decision, comment: reviewComment.trim() || undefined } });
      router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to save the review."); }
    finally { setBusy(false); }
  }

  function beginEdit(entry: WorkReportEntry) { setEditingId(entry.id); setForm(toForm(entry)); setShowEntryForm(true); }
  const taskName = (id?: string) => id ? tasks.find(t => t.id === id)?.title ?? "Linked task" : "Standalone activity";

  return <div className="space-y-6">
    <PageHeader eyebrow="DAILY WORK REPORT" title={new Date(`${report.reportDate}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      description={`${isAuthor ? "Your report" : `Submitted by ${authorDisplayName}`} · ${scopeNames.length ? scopeNames.join(" · ") : "Workspace report"} · Version ${Math.max(1, report.version)}`} icon={<FileText />}
      actions={<LinkButton href="/reports" variant="secondary" icon={<ArrowLeft />}>All reports</LinkButton>}
      meta={<><Badge tone={tone(report.status)}>{statusLabel(report.status)}</Badge><Badge>{entries.length} work entries</Badge><Badge><Clock3 className="mr-1 size-3" />{totalMinutes ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m logged` : "No time logged"}</Badge></>} />
    {report.status === "needs_revision" && report.reviewerComment ? <Panel className="border-warning/40 bg-warning-soft"><p className="text-xs font-bold uppercase tracking-wide text-warning">Revision requested</p><p className="mt-2 text-sm">{report.reviewerComment}</p></Panel> : null}
    {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}

    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><SectionHeading title="Work completed" count={entries.length} /><div className="flex gap-2">{canEdit && !showEntryForm ? <Button size="sm" onClick={() => { setEditingId(null); setForm(emptyEntry()); setShowEntryForm(true); }} icon={<Plus />}>Add work entry</Button> : null}</div></div>
      {entries.length ? <div className="space-y-3">{entries.map(entry => <article key={entry.id} className="rounded-lg border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{entry.activityTitle}</p><p className="mt-1 text-xs text-fg-3">{taskName(entry.taskId)}{entry.timeSpentMinutes !== undefined ? ` · ${entry.timeSpentMinutes} min` : ""}</p></div>{canEdit ? <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => beginEdit(entry)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(entry.id)} icon={<Trash2 />}><span className="sr-only">Delete entry</span></Button></div> : null}</div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{entry.workCompleted}</p>
        {entry.progressSummary ? <p className="mt-2 text-xs text-fg-2"><strong>Progress:</strong> {entry.progressSummary}</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{entry.blockers.length ? <div><p className="text-xs font-bold text-fg-2">Blockers</p><ul className="mt-1 list-disc pl-4 text-xs text-fg-2">{entry.blockers.map((v,i)=><li key={i}>{v}</li>)}</ul></div> : null}{entry.nextSteps.length ? <div><p className="text-xs font-bold text-fg-2">Next steps</p><ul className="mt-1 list-disc pl-4 text-xs text-fg-2">{entry.nextSteps.map((v,i)=><li key={i}>{v}</li>)}</ul></div> : null}</div>
        {entry.linkUrls.length ? <div className="mt-3 flex flex-wrap gap-3">{entry.linkUrls.map(url=><a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline"><ExternalLink className="size-3" />{new URL(url).hostname}</a>)}</div> : null}
      </article>)}</div> : <div className="rounded-lg border border-dashed border-line px-5 py-9 text-center"><p className="font-semibold">No work entries yet</p><p className="mt-1 text-sm text-fg-3">Add completed work, progress, blockers and next steps before submitting.</p></div>}

      {showEntryForm && canEdit ? <form onSubmit={saveEntry} className="mt-5 grid gap-4 rounded-lg border border-line-strong bg-surface p-4 md:grid-cols-2">
        <div className="md:col-span-2 flex items-center justify-between"><p className="font-semibold">{editingId ? "Edit work entry" : "New work entry"}</p><button type="button" onClick={() => { setShowEntryForm(false); setEditingId(null); setForm(emptyEntry()); }} className="text-xs font-semibold text-fg-3 hover:text-fg">Close</button></div>
        <label className="grid gap-1.5 text-[13px] font-semibold">Activity / work item<Input required maxLength={160} value={form.activityTitle} onChange={e=>setForm(v=>({...v,activityTitle:e.target.value}))} placeholder="e.g. Outreach research" /></label>
        <label className="grid gap-1.5 text-[13px] font-semibold">Related task <span className="font-normal text-fg-3">(optional)</span><Select value={form.taskId} onChange={e=>setForm(v=>({...v,taskId:e.target.value}))}><option value="">Standalone activity</option>{tasks.filter(t=>t.workspaceId===report.workspaceId).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</Select></label>
        <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Work completed<Textarea required rows={3} maxLength={5000} value={form.workCompleted} onChange={e=>setForm(v=>({...v,workCompleted:e.target.value}))} placeholder="Describe the work actually completed." /></label>
        <label className="grid gap-1.5 text-[13px] font-semibold md:col-span-2">Progress summary <span className="font-normal text-fg-3">(optional)</span><Textarea rows={2} maxLength={2000} value={form.progressSummary} onChange={e=>setForm(v=>({...v,progressSummary:e.target.value}))} placeholder="Progress against the intended outcome." /></label>
        <label className="grid gap-1.5 text-[13px] font-semibold">Time spent (minutes) <span className="font-normal text-fg-3">(optional)</span><Input type="number" min={0} max={1440} step={1} value={form.timeSpentMinutes} onChange={e=>setForm(v=>({...v,timeSpentMinutes:e.target.value}))} placeholder="e.g. 90" /></label>
        <label className="grid gap-1.5 text-[13px] font-semibold">Documents & reference links <span className="font-normal text-fg-3">(one URL per line)</span><Textarea rows={2} value={form.linkUrls} onChange={e=>setForm(v=>({...v,linkUrls:e.target.value}))} placeholder="https://drive.google.com/..." /></label>
        <label className="grid gap-1.5 text-[13px] font-semibold">Blockers <span className="font-normal text-fg-3">(one per line)</span><Textarea rows={2} value={form.blockers} onChange={e=>setForm(v=>({...v,blockers:e.target.value}))} placeholder="Anything preventing progress?" /></label>
        <label className="grid gap-1.5 text-[13px] font-semibold">Next steps <span className="font-normal text-fg-3">(one per line)</span><Textarea rows={2} value={form.nextSteps} onChange={e=>setForm(v=>({...v,nextSteps:e.target.value}))} placeholder="What happens next?" /></label>
        <p className="md:col-span-2 text-xs text-fg-3">Add links to shared documents or deliverables above. Firestore stores the URLs only; the files remain in your approved document storage.</p>
        <div className="md:col-span-2 flex justify-end"><Button type="submit" loading={busy}>{editingId ? "Save changes" : "Add entry"}</Button></div>
      </form> : null}
      {canEdit ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-fg-3">Drafts are editable. Submitting locks the report and snapshots this version for review.</p><Button variant="primary" onClick={submitReport} loading={busy} disabled={!entries.length} icon={<Send />}>Submit report</Button></div> : null}
    </Panel>

    {canReview ? <Panel><SectionHeading title="Review this report" /><p className="mb-3 text-sm text-fg-2">Approve the submitted report or request a revision. A comment is mandatory when requesting changes.</p><label className="grid gap-1.5 text-[13px] font-semibold">Review comment <span className="font-normal text-fg-3">(required for revision)</span><Textarea rows={3} maxLength={2000} value={reviewComment} onChange={e=>setReviewComment(e.target.value)} placeholder="Feedback for the report author." /></label><div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy || !reviewComment.trim()} onClick={()=>review("needs_revision")} loading={busy}>Request revision</Button><Button variant="primary" disabled={busy} onClick={()=>review("approved")} loading={busy} icon={<CheckCircle2 />}>Approve report</Button></div></Panel> : null}

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel><SectionHeading title="Submission history" count={versions.length} />{versions.length ? <div className="space-y-3">{versions.map(v=><div key={v.id} className="rounded-lg border border-line p-3"><div className="flex justify-between gap-3"><p className="font-semibold">Version {v.version}</p><Badge tone="info">Submitted</Badge></div><p className="mt-1 text-xs text-fg-3">Submitted by {authorDisplayName} · {fmtWhen(v.submittedAt)} · {v.entries.length} entries</p><ul className="mt-2 list-disc pl-4 text-xs text-fg-2">{v.entries.map(e=><li key={e.id}>{e.activityTitle}</li>)}</ul></div>)}</div> : <p className="text-sm text-fg-3">No submission versions yet.</p>}</Panel>
      <Panel><SectionHeading title="Review history" count={reviews.length} />{reviews.length ? <div className="space-y-3">{reviews.map(r=><div key={r.id} className="rounded-lg border border-line p-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{r.decision === "approved" ? "Report approved" : "Revision requested"}</p><Badge tone={r.decision === "approved" ? "success" : "warning"}>Version {r.version}</Badge></div><p className="mt-1 text-xs text-fg-3">Reviewed by {r.reviewerDisplayName} · {fmtWhen(r.createdAt)}</p>{r.comment ? <p className="mt-2 whitespace-pre-wrap text-sm">{r.comment}</p> : null}</div>)}</div> : <p className="text-sm text-fg-3">No review actions yet.</p>}</Panel>
    </div>
    <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => void removeEntry()} title="Delete work entry?" consequence="This entry will be removed from the editable report draft. Submitted report versions and review history are not changed." confirmLabel="Delete entry" tone="danger" loading={busy} error={error} />
  </div>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ClipboardList, Inbox, Plus, Trash2 } from "lucide-react";
import type { WorkReport } from "@/domain/types";
import type { ScopeSummary } from "@/server/queries";
import { api, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/dialog";

const statusLabel = (status: WorkReport["status"]) => ({ draft: "Draft", submitted: "Submitted", needs_revision: "Needs revision", approved: "Approved" })[status];
const REPORT_TONES = { draft: "neutral", submitted: "info", needs_revision: "warning", approved: "success" } as const;
const tone = (status: WorkReport["status"]) => REPORT_TONES[status];
const fmtDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

type ReportListItem = WorkReport & { userDisplayName?: string };

function ReportRows({ reports, empty, showOwner = false, showDeleted = false, onDelete, onRestore }: { reports: ReportListItem[]; empty: string; showOwner?: boolean; showDeleted?: boolean; onDelete?: (report: WorkReport) => void; onRestore?: (report: WorkReport) => void }) {
  if (!reports.length) return <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-fg-3">{empty}</p>;
  return <div className="divide-y divide-line">
    {reports.map(report => <div key={report.id} className="flex min-w-0 items-center gap-3 py-4 first:pt-0 last:pb-0">
      {showDeleted ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="font-semibold">{fmtDate(report.reportDate)}</p><p className="mt-1 text-xs text-fg-3">Deleted report · Version {Math.max(1, report.version)}</p></div>
          <Badge tone="neutral">Deleted</Badge>
        </div>
      ) : (
        <Link href={`/reports/${report.id}`} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 hover:text-accent-text">
          <div className="min-w-0"><p className="font-semibold">{fmtDate(report.reportDate)}{showOwner ? <span className="ml-2 text-xs font-normal text-fg-3">· {report.userDisplayName ?? "Inhub member"}</span> : null}</p><p className="mt-1 text-xs text-fg-3">{report.teamId ? "Team report" : report.workstreamId ? "Workstream report" : "Workspace report"} · Version {Math.max(1, report.version)}</p></div>
          <Badge tone={tone(report.status)}>{statusLabel(report.status)}</Badge>
        </Link>
      )}
      {showDeleted && onRestore ? <Button size="sm" variant="secondary" onClick={() => onRestore(report)}>Restore</Button> : onDelete && (report.status === "draft" || report.status === "needs_revision") ? <Button size="sm" variant="ghost" className="shrink-0 text-danger" icon={<Trash2 />} onClick={() => onDelete(report)} aria-label={`Delete report for ${report.reportDate}`} /> : null}
    </div>)}
  </div>;
}

export function ReportIndex({ mine, reviewQueue, workspaces, teams, workstreams, today, canReview, adminView, showDeleted = false }: {
  mine: WorkReport[]; reviewQueue: ReportListItem[]; workspaces: { id: string; name: string }[];
  teams: ScopeSummary[]; workstreams: ScopeSummary[]; today: string; canReview: boolean; adminView: boolean; showDeleted?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<WorkReport | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [form, setForm] = useState({ workspaceId: workspaces[0]?.id ?? "", reportDate: today, teamId: "", workstreamId: "" });

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ id: string }>("/api/reports", { method: "POST", body: { workspaceId: form.workspaceId, reportDate: form.reportDate, teamId: form.teamId || undefined, workstreamId: form.workstreamId || undefined } });
      router.push(`/reports/${result.id}`);
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to open this report."); }
    finally { setBusy(false); }
  }

  async function deleteSelectedReport() {
    if (!deleting) return;
    setDeleteBusy(true); setError("");
    try {
      await api(`/api/reports/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to delete report."); }
    finally { setDeleteBusy(false); }
  }

  async function restoreSelectedReport(report: WorkReport) {
    setDeleteBusy(true); setError("");
    try {
      await api(`/api/reports/${report.id}`, { method: "POST" });
      router.refresh();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to restore report."); }
    finally { setDeleteBusy(false); }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="WORK MANAGEMENT" title="Work reports" description="Record the work completed, progress, blockers and next steps. Submit each report for review." icon={<ClipboardList />}
      actions={<div className="flex flex-wrap gap-2">{!showDeleted ? <Button onClick={() => setOpen(v => !v)} icon={<Plus />}>{open ? "Close" : "New daily report"}</Button> : null}<Button variant="secondary" onClick={() => router.push(showDeleted ? "/reports" : "/reports?deleted=1")}>{showDeleted ? "Active reports" : "Deleted drafts"}</Button></div>}
      meta={<><Badge>{mine.length} {showDeleted ? "deleted" : "reports"}</Badge>{canReview && !showDeleted ? <Badge tone="info">{reviewQueue.length} awaiting review</Badge> : null}</>} />
    {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
    {open && !showDeleted ? <Panel>
      <SectionHeading title="Start a daily report" />
      <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-[13px] font-semibold">Workspace<Select required value={form.workspaceId} onChange={e => setForm(v => ({ ...v, workspaceId: e.target.value, teamId: "", workstreamId: "" }))}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
        <label className="grid gap-1.5 text-[13px] font-semibold">Reporting date<Input required type="date" value={form.reportDate} onChange={e => setForm(v => ({ ...v, reportDate: e.target.value }))} /></label>
        <label className="grid gap-1.5 text-[13px] font-semibold">Team context <span className="font-normal text-fg-3">(optional)</span><Select value={form.teamId} onChange={e => setForm(v => ({ ...v, teamId: e.target.value }))}><option value="">No team</option>{teams.filter(t => t.workspaceId === form.workspaceId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
        <label className="grid gap-1.5 text-[13px] font-semibold">Workstream context <span className="font-normal text-fg-3">(optional)</span><Select value={form.workstreamId} onChange={e => setForm(v => ({ ...v, workstreamId: e.target.value }))}><option value="">No workstream</option>{workstreams.filter(w => w.workspaceId === form.workspaceId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></label>
        <div className="md:col-span-2 flex items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-fg-3">One report per user, workspace and date. You can save a draft and return later.</p><Button type="submit" loading={busy} disabled={!form.workspaceId || !form.reportDate}>Open report</Button></div>
      </form>
    </Panel> : null}
    <div className={canReview ? "grid gap-5 xl:grid-cols-2" : "grid gap-5"}>
      <Panel><SectionHeading title={showDeleted ? "Deleted drafts" : "My reports"} count={mine.length} /><ReportRows reports={mine} empty={showDeleted ? "You have no deleted drafts." : "Your daily reports will appear here."} showDeleted={showDeleted} onDelete={(report) => setDeleting(report)} onRestore={restoreSelectedReport} /></Panel>
      {canReview && !showDeleted ? <Panel><SectionHeading title={adminView ? "All reports" : "Review queue"} count={reviewQueue.length} icon={<Inbox />} /><ReportRows reports={reviewQueue} empty={adminView ? "No reports have been created yet." : "No submitted reports are waiting for your review."} showOwner /></Panel> : null}
    </div>
    <ConfirmDialog open={!!deleting && !showDeleted} onClose={() => !deleteBusy && setDeleting(null)} onConfirm={deleteSelectedReport} loading={deleteBusy} error={error} tone="danger" title={`Delete report for ${deleting?.reportDate ?? "this date"}?`} confirmLabel="Delete report" consequence="Only draft or returned reports can be deleted. Submitted and approved reports remain locked to preserve their review history." />
    <p className="flex items-start gap-2 text-xs text-fg-3"><CalendarDays className="mt-0.5 size-4 shrink-0" /> Reports are not attendance records. Missing reports do not imply that no work was performed, and the system does not enforce a daily-hours minimum.</p>
  </div>;
}

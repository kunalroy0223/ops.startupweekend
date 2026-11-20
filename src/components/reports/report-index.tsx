"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ClipboardList, Inbox, Plus } from "lucide-react";
import type { WorkReport } from "@/domain/types";
import type { ScopeSummary } from "@/server/queries";
import { api, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";

const statusLabel = (status: WorkReport["status"]) => ({ draft: "Draft", submitted: "Submitted", needs_revision: "Needs revision", approved: "Approved" })[status];
const REPORT_TONES = { draft: "neutral", submitted: "info", needs_revision: "warning", approved: "success" } as const;
const tone = (status: WorkReport["status"]) => REPORT_TONES[status];
const fmtDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

type ReportListItem = WorkReport & { userDisplayName?: string };

function ReportRows({ reports, empty, showOwner = false }: { reports: ReportListItem[]; empty: string; showOwner?: boolean }) {
  if (!reports.length) return <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-fg-3">{empty}</p>;
  return <div className="divide-y divide-line">
    {reports.map(report => <Link key={report.id} href={`/reports/${report.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0 hover:bg-muted/40">
      <div className="min-w-0"><p className="font-semibold">{fmtDate(report.reportDate)}{showOwner ? <span className="ml-2 text-xs font-normal text-fg-3">· {report.userDisplayName ?? "Inhub member"}</span> : null}</p><p className="mt-1 text-xs text-fg-3">{report.teamId ? "Team report" : report.workstreamId ? "Workstream report" : "Workspace report"} · Version {Math.max(1, report.version)}</p></div>
      <Badge tone={tone(report.status)}>{statusLabel(report.status)}</Badge>
    </Link>)}
  </div>;
}

export function ReportIndex({ mine, reviewQueue, workspaces, teams, workstreams, today, canReview, adminView }: {
  mine: WorkReport[]; reviewQueue: ReportListItem[]; workspaces: { id: string; name: string }[];
  teams: ScopeSummary[]; workstreams: ScopeSummary[]; today: string; canReview: boolean; adminView: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ workspaceId: workspaces[0]?.id ?? "", reportDate: today, teamId: "", workstreamId: "" });

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ id: string }>("/api/reports", { method: "POST", body: { workspaceId: form.workspaceId, reportDate: form.reportDate, teamId: form.teamId || undefined, workstreamId: form.workstreamId || undefined } });
      router.push(`/reports/${result.id}`);
    } catch (err) { setError(err instanceof ApiClientError ? err.message : "Unable to open this report."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="WORK MANAGEMENT" title="Work reports" description="Record the work completed, progress, blockers and next steps. Submit each report for review." icon={<ClipboardList />}
      actions={<Button onClick={() => setOpen(v => !v)} icon={<Plus />}>{open ? "Close" : "New daily report"}</Button>}
      meta={<><Badge>{mine.length} reports</Badge>{canReview ? <Badge tone="info">{reviewQueue.length} awaiting review</Badge> : null}</>} />
    {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
    {open ? <Panel>
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
      <Panel><SectionHeading title="My reports" count={mine.length} /><ReportRows reports={mine} empty="Your daily reports will appear here." /></Panel>
      {canReview ? <Panel><SectionHeading title={adminView ? "All reports" : "Review queue"} count={reviewQueue.length} icon={<Inbox />} /><ReportRows reports={reviewQueue} empty={adminView ? "No reports have been created yet." : "No submitted reports are waiting for your review."} showOwner /></Panel> : null}
    </div>
    <p className="flex items-start gap-2 text-xs text-fg-3"><CalendarDays className="mt-0.5 size-4 shrink-0" /> Reports are not attendance records. Missing reports do not imply that no work was performed, and the system does not enforce a daily-hours minimum.</p>
  </div>;
}

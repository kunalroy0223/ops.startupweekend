import Link from "next/link";
import { ArrowDownToLine, ChartColumn, CircleAlert, ClipboardCheck, Clock3, FolderKanban, ListTodo, TrendingUp, UsersRound } from "lucide-react";
import type { AnalyticsSnapshot } from "@/domain/analytics";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Metric, MetricRow } from "@/components/ui/metric";
import { EmptyState } from "@/components/ui/states";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

const STATUS_ROWS = [
  { key: "backlog", label: "Backlog", color: "bg-slate" },
  { key: "assigned", label: "Assigned", color: "bg-info" },
  { key: "inProgress", label: "In progress", color: "bg-accent" },
  { key: "inReview", label: "In review", color: "bg-warning" },
  { key: "blocked", label: "Blocked", color: "bg-danger" },
  { key: "completed", label: "Completed", color: "bg-success" },
  { key: "cancelled", label: "Cancelled", color: "bg-slate" },
] as const;

function TrendBars({ analytics }: { analytics: AnalyticsSnapshot }) {
  const points = analytics.completionAndReportingTrend;
  const max = Math.max(1, ...points.flatMap((point) => [point.completedTasks, point.submittedReports]));
  return (
    <div>
      <div className="grid h-40 grid-cols-8 items-end gap-2" role="img" aria-label="Task completions and work report submissions across the selected reporting period">
        {points.map((point) => (
          <div key={point.startAt} className="flex h-full min-w-0 items-end justify-center gap-1 border-b border-line pb-1">
            <span className="w-2.5 rounded-t-sm bg-accent" style={{ height: `${Math.max(point.completedTasks ? 4 : 0, (point.completedTasks / max) * 100)}%` }} title={`${point.completedTasks} task completions`} />
            <span className="w-2.5 rounded-t-sm bg-info" style={{ height: `${Math.max(point.submittedReports ? 4 : 0, (point.submittedReports / max) * 100)}%` }} title={`${point.submittedReports} report submissions`} />
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-8 gap-2 text-center font-mono text-[10px] text-fg-3">
        {points.map((point) => <span key={point.startAt}>{point.label}</span>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-fg-2">
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-accent" />Task completions</span>
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-info" />Report submissions</span>
      </div>
    </div>
  );
}

function TaskStatusBreakdown({ analytics }: { analytics: AnalyticsSnapshot }) {
  const total = Math.max(analytics.tasks.total, 1);
  return (
    <div className="grid gap-3">
      {STATUS_ROWS.map((row) => {
        const value = analytics.tasks[row.key];
        const width = Math.min(100, (value / total) * 100);
        return (
          <div key={row.key} className="grid grid-cols-[105px_minmax(0,1fr)_34px] items-center gap-3 text-[13px]">
            <span className="text-fg-2">{row.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span className={`block h-full rounded-full ${row.color}`} style={{ width: `${width}%` }} />
            </span>
            <span className="text-right font-mono tabular">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function WorkloadTable({ title, rows }: { title: string; rows: AnalyticsSnapshot["teamWorkload"] }) {
  return (
    <Panel>
      <SectionHeading title={title} count={rows.length} />
      {rows.length ? (
        <Table caption={title}>
          <thead><tr><Th>Name</Th><Th>People</Th><Th>Tasks</Th><Th>Overdue</Th><Th>In progress</Th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={`${row.kind}-${row.id}`}>
                <Td><span className="font-semibold">{row.name}</span><span className="ml-2 text-[11px] text-fg-3">{row.kind === "team" ? "Team" : "Workstream"}</span></Td>
                <Td className="font-mono tabular">{row.people}</Td>
                <Td className="font-mono tabular">{row.tasks}</Td>
                <Td><span className={row.overdue ? "font-mono font-semibold text-danger" : "font-mono text-fg-2"}>{row.overdue}</span></Td>
                <Td className="font-mono tabular">{row.inProgress}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : <EmptyState compact icon={<UsersRound />} title="No team workload to report">Teams in your authorised scope will appear here when work is assigned.</EmptyState>}
    </Panel>
  );
}

export function AnalyticsDashboard({ analytics }: { analytics: AnalyticsSnapshot }) {
  const isMember = analytics.role === "member";
  const heading = analytics.role === "admin" ? "Organisation analytics" : analytics.role === "lead" ? "Team analytics" : "My analytics";
  const subtitle = analytics.role === "admin"
    ? "A view of active work, delivery health and reporting across the organisation."
    : analytics.role === "lead"
      ? "Progress, workload and report activity across the teams and workstreams assigned to you."
      : "Your assigned work, upcoming deadlines and personal reporting activity.";
  const submittedLabel = isMember ? "Your reports submitted" : analytics.role === "lead" ? "Reports awaiting review" : "Reports awaiting review";
  const submittedValue = analytics.role === "member" ? analytics.reports.submitted : analytics.reports.awaitingReview;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="MODULE 4 · DASHBOARDS & ANALYTICS"
        title={heading}
        description={subtitle}
        icon={<ChartColumn />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={analytics.role} />
            <div className="inline-flex rounded-lg border border-line bg-muted p-1 text-xs">
              <Link href="/analytics?range=30" aria-current={analytics.rangeDays === 30 ? "page" : undefined} className={`rounded-md px-3 py-1.5 font-semibold ${analytics.rangeDays === 30 ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>30 days</Link>
              <Link href="/analytics?range=90" aria-current={analytics.rangeDays === 90 ? "page" : undefined} className={`rounded-md px-3 py-1.5 font-semibold ${analytics.rangeDays === 90 ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>90 days</Link>
            </div>
            <a href={`/api/analytics/export?range=${analytics.rangeDays}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold hover:bg-muted"><ArrowDownToLine className="size-4" />Export CSV</a>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
        <span>{analytics.role === "admin" ? "Organisation-wide data" : analytics.role === "lead" ? "Limited to your assigned team and workstream scope" : "Personal metrics; team-shared tasks are shown separately"}</span>
        <span>Updated {formatDate(analytics.generatedAt, analytics.timeZone, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
      </div>

      <MetricRow>
        <Metric icon={<ListTodo />} label={isMember ? "Your tasks" : "Visible tasks"} value={analytics.tasks.total} emphasis />
        <Metric icon={<Clock3 />} label="Open work" value={analytics.tasks.open} />
        <Metric icon={<CircleAlert />} label="Overdue" value={analytics.tasks.overdue} />
        <Metric icon={<TrendingUp />} label="Completed in period" value={analytics.tasks.completedInRange} />
        <Metric icon={<FolderKanban />} label="Active projects" value={analytics.projects.active} />
        <Metric icon={<ClipboardCheck />} label={submittedLabel} value={submittedValue} />
      </MetricRow>

      {isMember && analytics.tasks.teamVisible > 0 ? <Badge tone="info">{analytics.tasks.teamVisible} additional team-shared task{analytics.tasks.teamVisible === 1 ? "" : "s"} visible in Tasks; excluded from personal workload totals</Badge> : null}

      <div className="grid gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <SectionHeading title="Delivery trend" icon={<TrendingUp />} />
          <TrendBars analytics={analytics} />
        </Panel>
        <Panel className="xl:col-span-5">
          <SectionHeading title={isMember ? "Your task status" : "Task status"} icon={<ListTodo />} />
          {analytics.tasks.total ? <TaskStatusBreakdown analytics={analytics} /> : <EmptyState compact icon={<ListTodo />} title="No visible tasks yet">Tasks will appear here as work is assigned within your access scope.</EmptyState>}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-5">
          <SectionHeading title={isMember ? "Your report activity" : "Work report activity"} icon={<ClipboardCheck />} />
          <MetricRow>
            <Metric label="Submitted in period" value={analytics.reports.submittedInRange} />
            <Metric label="Approved" value={analytics.reports.approved} />
            <Metric label="Needs revision" value={analytics.reports.needsRevision} />
          </MetricRow>
          <p className="mt-4 text-xs text-fg-2">Reporting activity is shown as submissions and review states. A compliance rate is not calculated because the organisation&apos;s required reporting cadence has not been defined.</p>
        </Panel>
        <Panel className="xl:col-span-7">
          <SectionHeading title="Delivery health" icon={<ChartColumn />} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div><p className="eyebrow">Blocked work</p><p className="display mt-1 text-3xl tabular">{analytics.tasks.blocked}</p><p className="mt-1 text-xs text-fg-2">Tasks marked blocked</p></div>
            <div><p className="eyebrow">Due in 7 days</p><p className="display mt-1 text-3xl tabular">{analytics.tasks.dueSoon}</p><p className="mt-1 text-xs text-fg-2">Upcoming open tasks</p></div>
            <div><p className="eyebrow">Active reporting periods</p><p className="display mt-1 text-3xl tabular">{analytics.reports.activeReportingPeriods}</p><p className="mt-1 text-xs text-fg-2">Buckets with at least one submission</p></div>
          </div>
        </Panel>
      </div>

      {!isMember ? (
        <div className="grid gap-6">
          <WorkloadTable title="Team workload distribution" rows={analytics.teamWorkload} />
          <WorkloadTable title="Workstream workload distribution" rows={analytics.workstreamWorkload} />
        </div>
      ) : null}

      <p className="text-xs text-fg-3">Metrics reflect active, non-archived tasks currently visible to your role. Workload counts are grouped by assigned team or workstream; a task linked to both appears in each relevant group.</p>
    </div>
  );
}

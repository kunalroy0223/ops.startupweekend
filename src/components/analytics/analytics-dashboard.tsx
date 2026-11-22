import Link from "next/link";
import { ArrowDownToLine, ChartColumn, CircleAlert, ClipboardCheck, Clock3, FolderKanban, ListTodo, TrendingUp, UsersRound, Activity, PieChart, CalendarDays, Gauge } from "lucide-react";
import type { AnalyticsSnapshot } from "@/domain/analytics";
import type { TaskPriority } from "@/domain/types";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Metric, MetricRow } from "@/components/ui/metric";
import { EmptyState } from "@/components/ui/states";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

const STATUS_ROWS = [
  { key: "backlog", label: "Backlog", color: "var(--text-tertiary)" },
  { key: "assigned", label: "Assigned", color: "var(--info)" },
  { key: "inProgress", label: "In progress", color: "var(--accent)" },
  { key: "inReview", label: "In review", color: "var(--warning)" },
  { key: "blocked", label: "Blocked", color: "var(--danger)" },
  { key: "completed", label: "Completed", color: "var(--success)" },
  { key: "cancelled", label: "Cancelled", color: "var(--border-strong)" },
] as const;
const PRIORITIES: { key: TaskPriority; label: string; color: string }[] = [
  { key: "low", label: "Low", color: "var(--text-tertiary)" },
  { key: "medium", label: "Medium", color: "var(--info)" },
  { key: "high", label: "High", color: "var(--warning)" },
  { key: "urgent", label: "Urgent", color: "var(--danger)" },
];

function DonutChart({ title, segments, total, note }: {
  title: string;
  segments: { label: string; value: number; color: string }[];
  total: number;
  note: string;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const values = segments.filter((segment) => segment.value > 0);
  const chartSegments = values.map((segment, index) => {
    const length = (segment.value / Math.max(total, 1)) * circumference;
    const offset = values.slice(0, index).reduce(
      (sum, previous) => sum + (previous.value / Math.max(total, 1)) * circumference,
      0,
    );
    return { ...segment, length, offset };
  });
  return (
    <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative size-36 shrink-0" role="img" aria-label={`${title}: ${segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")}`}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-muted)" strokeWidth="12" />
          {chartSegments.map((segment) => (
            <circle
              key={segment.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={`${segment.length} ${circumference - segment.length}`}
              strokeDashoffset={-segment.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="display text-3xl tabular">{total}</span>
          <span className="eyebrow !text-[9px]">{note}</span>
        </div>
      </div>
      <div className="grid w-full min-w-0 gap-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex min-w-0 items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-fg-2"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} /> <span className="truncate">{segment.label}</span></span>
            <span className="font-mono tabular text-fg">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeliveryAreaChart({ analytics }: { analytics: AnalyticsSnapshot }) {
  const points = analytics.completionAndReportingTrend;
  const max = Math.max(1, ...points.flatMap((point) => [point.completedTasks, point.submittedReports]));
  const coords = (values: number[]) => values.map((value, index) => ({
    x: 42 + (index / Math.max(points.length - 1, 1)) * 632,
    y: 180 - (value / max) * 148,
  }));
  const completed = coords(points.map((point) => point.completedTasks));
  const reports = coords(points.map((point) => point.submittedReports));
  const path = (items: { x: number; y: number }[]) => items.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = (items: { x: number; y: number }[]) => `${path(items)} L${items[items.length - 1]?.x ?? 674},180 L${items[0]?.x ?? 42},180 Z`;
  return (
    <div className="min-w-0">
      <div className="w-full min-w-0 overflow-hidden">
        <svg viewBox="0 0 720 220" className="block h-auto w-full" role="img" aria-label="Area and line chart showing task completions and submitted reports by period">
          {[32, 82, 132, 180].map((y) => <line key={y} x1="42" x2="674" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 5" />)}
          <path d={area(reports)} fill="var(--info)" opacity=".10" />
          <path d={area(completed)} fill="var(--accent)" opacity=".12" />
          <path d={path(reports)} fill="none" stroke="var(--info)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d={path(completed)} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {reports.map((point, index) => <circle key={`r-${index}`} cx={point.x} cy={point.y} r="3.5" fill="var(--info)" />)}
          {completed.map((point, index) => <circle key={`c-${index}`} cx={point.x} cy={point.y} r="3.5" fill="var(--accent)" />)}
        </svg>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1 text-[10px] text-fg-3 sm:grid-cols-8">
        {points.map((point) => <span key={point.startAt} className="truncate text-center font-mono">{point.label}</span>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-fg-2">
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-accent" />Task completions</span>
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-info" />Report submissions</span>
      </div>
    </div>
  );
}

function WorkVolumeBarChart({ analytics }: { analytics: AnalyticsSnapshot }) {
  const points = analytics.completionAndReportingTrend;
  const max = Math.max(1, ...points.flatMap((point) => [point.createdTasks, point.completedTasks]));
  const baseline = 148;
  const chartHeight = 112;
  const groupWidth = 640 / Math.max(points.length, 1);
  const barWidth = Math.min(18, groupWidth * 0.28);
  return (
    <div className="min-w-0">
      <div className="w-full min-w-0 overflow-hidden">
        <svg viewBox="0 0 640 178" className="block h-auto w-full" role="img" aria-label="Grouped column chart comparing tasks created and completed during each period">
          {[36, 92, baseline].map((y) => <line key={y} x1="12" x2="628" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 5" />)}
          {points.map((point, index) => {
            const center = groupWidth * index + groupWidth / 2;
            const createdHeight = (point.createdTasks / max) * chartHeight;
            const completedHeight = (point.completedTasks / max) * chartHeight;
            return <g key={point.startAt}>
              <rect x={center - barWidth - 2} y={baseline - createdHeight} width={barWidth} height={createdHeight} rx="3" fill="var(--info)" />
              <rect x={center + 2} y={baseline - completedHeight} width={barWidth} height={completedHeight} rx="3" fill="var(--accent)" />
            </g>;
          })}
        </svg>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1 text-[10px] text-fg-3 sm:grid-cols-8">
        {points.map((point) => <span key={point.startAt} className="truncate text-center font-mono">{point.label}</span>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-fg-2">
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-info" />Tasks created</span>
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm bg-accent" />Tasks completed</span>
      </div>
    </div>
  );
}

function TaskStatusBars({ analytics }: { analytics: AnalyticsSnapshot }) {
  const total = Math.max(analytics.tasks.total, 1);
  return (
    <div className="grid gap-3">
      {STATUS_ROWS.map((row) => {
        const value = analytics.tasks[row.key];
        const width = Math.min(100, (value / total) * 100);
        return (
          <div key={row.key} className="grid min-w-0 grid-cols-[minmax(76px,104px)_minmax(0,1fr)_30px] items-center gap-2 text-xs sm:gap-3">
            <span className="truncate text-fg-2">{row.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${width}%`, backgroundColor: row.color }} /></span>
            <span className="text-right font-mono tabular">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function PriorityDistribution({ analytics }: { analytics: AnalyticsSnapshot }) {
  const total = Math.max(analytics.tasks.total, 1);
  return (
    <div className="grid gap-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Task priority distribution: ${PRIORITIES.map((item) => `${item.label} ${analytics.tasks.priorities[item.key]}`).join(", ")}`}>
        {PRIORITIES.map((item) => <span key={item.key} style={{ width: `${(analytics.tasks.priorities[item.key] / total) * 100}%`, backgroundColor: item.color }} />)}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {PRIORITIES.map((item) => <div key={item.key} className="min-w-0"><p className="flex items-center gap-1.5 text-xs text-fg-2"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</p><p className="mt-1 font-mono text-lg font-semibold tabular">{analytics.tasks.priorities[item.key]}</p></div>)}
      </div>
    </div>
  );
}

function ActivityHeatmap({ analytics }: { analytics: AnalyticsSnapshot }) {
  const max = Math.max(1, ...analytics.activityHeatmap.map((cell) => cell.total));
  const firstDate = analytics.activityHeatmap[0]?.date;
  const leading = firstDate ? (new Date(`${firstDate}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center font-mono text-[9px] uppercase text-fg-3">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1" role="img" aria-label="Activity heatmap of task completions and report submissions by day">
        {Array.from({ length: leading }, (_, index) => <span key={`empty-${index}`} />)}
        {analytics.activityHeatmap.map((cell) => {
          const intensity = cell.total ? 18 + Math.round((cell.total / max) * 72) : 0;
          return <span key={cell.date} title={`${cell.date}: ${cell.completedTasks} tasks completed, ${cell.submittedReports} reports submitted`} className="aspect-square min-w-0 rounded-[3px] border border-line/40" style={{ backgroundColor: cell.total ? `color-mix(in srgb, var(--accent) ${intensity}%, var(--surface-muted))` : "var(--surface-muted)" }} />;
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-fg-3"><span>Less activity</span><div className="flex gap-1">{[0, 1, 2, 3, 4].map((n) => <span key={n} className="size-2.5 rounded-[2px]" style={{ backgroundColor: n ? `color-mix(in srgb, var(--accent) ${18 + n * 18}%, var(--surface-muted))` : "var(--surface-muted)" }} />)}</div><span>More activity</span></div>
    </div>
  );
}

function WorkloadBars({ title, rows }: { title: string; rows: AnalyticsSnapshot["teamWorkload"] }) {
  const max = Math.max(1, ...rows.map((row) => row.tasks));
  return (
    <Panel className="min-w-0">
      <SectionHeading title={title} count={rows.length} />
      {rows.length ? <><div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-fg-3"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />Completed</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />In progress</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-info" />Other open</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--border-strong)]" />Cancelled</span></div><div className="grid gap-3">{rows.slice(0, 8).map((row) => (
        <div key={`${row.kind}-${row.id}`} className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium">{row.name}</span><span className="shrink-0 font-mono tabular text-fg-2">{row.tasks} tasks</span></div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"><span style={{ width: `${(row.completed / max) * 100}%` }} className="bg-success" /><span style={{ width: `${(row.inProgress / max) * 100}%` }} className="bg-accent" /><span style={{ width: `${(Math.max(0, row.tasks - row.completed - row.inProgress - row.cancelled) / max) * 100}%` }} className="bg-info" /><span style={{ width: `${(row.cancelled / max) * 100}%` }} className="bg-[var(--border-strong)]" /></div>
          <div className="flex justify-between text-[10px] text-fg-3"><span>{row.people} people · {row.inProgress} in progress</span><span className={row.overdue ? "text-danger" : ""}>{row.overdue} overdue</span></div>
        </div>
      ))}</div></> : <EmptyState compact icon={<UsersRound />} title="No workload to compare">Teams in your authorised scope appear when tasks are assigned.</EmptyState>}
    </Panel>
  );
}

function ProjectProgress({ analytics }: { analytics: AnalyticsSnapshot }) {
  const rows = analytics.projects.rows;
  return (
    <Panel className="min-w-0">
      <SectionHeading title="Project progress" count={rows.length} />
      {rows.length ? <div className="grid gap-4">{rows.slice(0, 8).map((project) => (
        <div key={project.id} className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-semibold">{project.name}</span><span className="shrink-0 font-mono tabular">{project.progress}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${project.progress}%` }} /></div>
          <p className="text-[10px] text-fg-3">{project.completed}/{project.tasks} completed · {project.inProgress} in progress · <span className={project.overdue ? "text-danger" : ""}>{project.overdue} overdue</span></p>
        </div>
      ))}</div> : <EmptyState compact icon={<FolderKanban />} title="No active projects">Project progress will appear once projects and tasks are created.</EmptyState>}
    </Panel>
  );
}

function MemberWorkloadChart({ analytics }: { analytics: AnalyticsSnapshot }) {
  const rows = analytics.memberWorkload.slice(0, 10);
  const max = Math.max(1, ...rows.map((row) => row.ownedOpen + row.collaboratingOpen + row.completed));
  return (
    <Panel className="min-w-0">
      <SectionHeading title="Member task distribution" count={analytics.memberWorkload.length} />
      <p className="mb-4 text-[11px] text-fg-3">Task counts by accountable ownership and collaboration. This is workload visibility, not a productivity score.</p>
      {rows.length ? <div className="grid gap-3">{rows.map((row) => (
        <div key={row.uid} className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium">{row.name}</span><span className="shrink-0 font-mono tabular text-fg-2">{row.ownedOpen + row.collaboratingOpen + row.completed}</span></div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${row.name}: ${row.ownedOpen} owned open, ${row.collaboratingOpen} collaborating open, ${row.completed} completed`}>
            <span className="bg-accent" style={{ width: `${(row.ownedOpen / max) * 100}%` }} />
            <span className="bg-info" style={{ width: `${(row.collaboratingOpen / max) * 100}%` }} />
            <span className="bg-success" style={{ width: `${(row.completed / max) * 100}%` }} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[10px] text-fg-3"><span>{row.ownedOpen} owned · {row.collaboratingOpen} collaborating · {row.completed} completed</span><span className={row.overdue ? "text-danger" : ""}>{row.overdue} overdue</span></div>
        </div>
      ))}</div> : <EmptyState compact icon={<UsersRound />} title="No member workload data">Active people in your authorised directory appear here when tasks are assigned.</EmptyState>}
    </Panel>
  );
}

function WorkloadTable({ title, rows }: { title: string; rows: AnalyticsSnapshot["teamWorkload"] }) {
  return (
    <Panel className="min-w-0">
      <SectionHeading title={title} count={rows.length} />
      {rows.length ? <Table caption={title}>
        <thead><tr><Th>Name</Th><Th>People</Th><Th>Tasks</Th><Th>Overdue</Th><Th>In progress</Th></tr></thead>
        <tbody>{rows.map((row) => <Tr key={`${row.kind}-${row.id}`}>
          <Td><span className="font-semibold">{row.name}</span><span className="ml-2 text-[11px] text-fg-3">{row.kind === "team" ? "Team" : "Workstream"}</span></Td>
          <Td className="font-mono tabular">{row.people}</Td><Td className="font-mono tabular">{row.tasks}</Td>
          <Td><span className={row.overdue ? "font-mono font-semibold text-danger" : "font-mono text-fg-2"}>{row.overdue}</span></Td><Td className="font-mono tabular">{row.inProgress}</Td>
        </Tr>)}</tbody>
      </Table> : <EmptyState compact icon={<UsersRound />} title="No workload to report">Teams in your authorised scope will appear here when work is assigned.</EmptyState>}
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
  const submittedLabel = isMember ? "Your reports submitted" : "Reports awaiting review";
  const submittedValue = isMember ? analytics.reports.submitted : analytics.reports.awaitingReview;
  const reportDraft = analytics.reports.draft;

  return (
    <div className="grid min-w-0 w-full max-w-full gap-5 sm:gap-6">
      <PageHeader eyebrow="MODULE 7 · ANALYTICS & PERFORMANCE" title={heading} description={subtitle} icon={<ChartColumn />}
        actions={<div className="flex min-w-0 flex-wrap items-center gap-2"><RoleBadge role={analytics.role} />
          <div className="inline-flex rounded-lg border border-line bg-muted p-1 text-xs"><Link href="/analytics?range=30" aria-current={analytics.rangeDays === 30 ? "page" : undefined} className={`rounded-md px-3 py-1.5 font-semibold ${analytics.rangeDays === 30 ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>30 days</Link><Link href="/analytics?range=90" aria-current={analytics.rangeDays === 90 ? "page" : undefined} className={`rounded-md px-3 py-1.5 font-semibold ${analytics.rangeDays === 90 ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>90 days</Link></div>
          <a href={`/api/analytics/export?range=${analytics.rangeDays}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold hover:bg-muted"><ArrowDownToLine className="size-4" />Export CSV</a>
        </div>}
      />

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-fg-2"><span>{analytics.role === "admin" ? "Organisation-wide data" : analytics.role === "lead" ? "Limited to your assigned team and workstream scope" : "Personal metrics; team-shared tasks are shown separately"}</span><span>Updated {formatDate(analytics.generatedAt, analytics.timeZone, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></div>

      <MetricRow className="min-w-0">
        <Metric icon={<ListTodo />} label={isMember ? "Your tasks" : "Visible tasks"} value={analytics.tasks.total} emphasis />
        <Metric icon={<Clock3 />} label="Open work" value={analytics.tasks.open} />
        <Metric icon={<CircleAlert />} label="Overdue" value={analytics.tasks.overdue} />
        <Metric icon={<TrendingUp />} label="Completed in period" value={analytics.tasks.completedInRange} />
        <Metric icon={<FolderKanban />} label="Active projects" value={analytics.projects.active} />
        <Metric icon={<ClipboardCheck />} label={submittedLabel} value={submittedValue} />
      </MetricRow>
      {isMember && analytics.tasks.teamVisible > 0 ? <Badge tone="info">{analytics.tasks.teamVisible} additional team-shared task{analytics.tasks.teamVisible === 1 ? "" : "s"} visible in Tasks; excluded from personal workload totals</Badge> : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-12">
        <Panel className="min-w-0 xl:col-span-7"><SectionHeading title="Delivery trend" icon={<TrendingUp />} /><DeliveryAreaChart analytics={analytics} /></Panel>
        <Panel className="min-w-0 xl:col-span-5"><SectionHeading title={isMember ? "Your task status" : "Task status"} icon={<PieChart />} />
          {analytics.tasks.total ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"><DonutChart title="Task status breakdown" total={analytics.tasks.total} note="tasks" segments={STATUS_ROWS.map((row) => ({ label: row.label, value: analytics.tasks[row.key], color: row.color }))} /><TaskStatusBars analytics={analytics} /></div> : <EmptyState compact icon={<ListTodo />} title="No visible tasks yet">Tasks appear as work is assigned within your access scope.</EmptyState>}
        </Panel>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Panel className="min-w-0"><SectionHeading title="Work volume by period" icon={<ChartColumn />} /><WorkVolumeBarChart analytics={analytics} /></Panel>
        <Panel className="min-w-0"><SectionHeading title="Task priority mix" icon={<Gauge />} />{analytics.tasks.total ? <PriorityDistribution analytics={analytics} /> : <EmptyState compact icon={<Gauge />} title="No priority data">Priority distribution appears when tasks are created.</EmptyState>}</Panel>
        <Panel className="min-w-0"><SectionHeading title="Daily activity" icon={<CalendarDays />} /><ActivityHeatmap analytics={analytics} /><p className="mt-3 text-[10px] text-fg-3">Daily task completions and report submissions across the selected period.</p></Panel>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-12">
        <Panel className="min-w-0 xl:col-span-5"><SectionHeading title={isMember ? "Your report activity" : "Work report activity"} icon={<ClipboardCheck />} />
          {analytics.reports.visible ? <DonutChart title="Report status" total={analytics.reports.visible} note="reports" segments={[
            { label: "Draft", value: reportDraft, color: "var(--text-tertiary)" },
            { label: "Submitted", value: analytics.reports.submitted, color: "var(--info)" },
            { label: "Approved", value: analytics.reports.approved, color: "var(--success)" },
            { label: "Needs revision", value: analytics.reports.needsRevision, color: "var(--warning)" },
          ]} /> : <EmptyState compact icon={<ClipboardCheck />} title="No reports yet">Work report activity will appear after the first report is submitted.</EmptyState>}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-3"><div><p className="eyebrow">Submitted in period</p><p className="display mt-1 text-2xl tabular">{analytics.reports.submittedInRange}</p></div><div><p className="eyebrow">Approved</p><p className="display mt-1 text-2xl tabular">{analytics.reports.approved}</p></div><div><p className="eyebrow">Needs revision</p><p className="display mt-1 text-2xl tabular">{analytics.reports.needsRevision}</p></div></div>
        </Panel>
        <ProjectProgress analytics={analytics} />
      </div>

      {!isMember ? <div className="grid min-w-0 gap-5 xl:grid-cols-3"><WorkloadBars title="Team workload" rows={analytics.teamWorkload} /><WorkloadBars title="Workstream workload" rows={analytics.workstreamWorkload} /><MemberWorkloadChart analytics={analytics} /></div> : null}
      {!isMember ? <div className="grid min-w-0 gap-5 xl:grid-cols-2"><WorkloadTable title="Team workload details" rows={analytics.teamWorkload} /><WorkloadTable title="Workstream workload details" rows={analytics.workstreamWorkload} /></div> : null}

      <Panel className="min-w-0"><SectionHeading title="Delivery health" icon={<Activity />} /><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><p className="eyebrow">Blocked work</p><p className="display mt-1 text-3xl tabular">{analytics.tasks.blocked}</p><p className="mt-1 text-xs text-fg-2">Tasks marked blocked</p></div>
        <div><p className="eyebrow">Due in 7 days</p><p className="display mt-1 text-3xl tabular">{analytics.tasks.dueSoon}</p><p className="mt-1 text-xs text-fg-2">Upcoming open tasks</p></div>
        <div><p className="eyebrow">Awaiting review</p><p className="display mt-1 text-3xl tabular">{analytics.reports.awaitingReview}</p><p className="mt-1 text-xs text-fg-2">Submitted reports</p></div>
        <div><p className="eyebrow">Active reporting periods</p><p className="display mt-1 text-3xl tabular">{analytics.reports.activeReportingPeriods}</p><p className="mt-1 text-xs text-fg-2">Trend buckets with submissions</p></div>
      </div><p className="mt-4 text-[11px] text-fg-3">A reporting compliance rate is not calculated because the organisation&apos;s required reporting cadence has not been defined.</p></Panel>

      <p className="text-xs text-fg-3">Metrics reflect active, non-archived tasks currently visible to your role. Workload counts are grouped by assigned team or workstream; a task linked to both appears in each relevant group.</p>
    </div>
  );
}

import type { Project, Task, WorkReport, TaskStatus, TaskPriority } from "./types";
import type { Role } from "./types";

export interface AnalyticsScopeItem {
  id: string;
  name: string;
  memberCount: number;
}

export interface AnalyticsTrendPoint {
  label: string;
  startAt: string;
  createdTasks: number;
  completedTasks: number;
  submittedReports: number;
}

export interface AnalyticsHeatmapCell {
  date: string;
  completedTasks: number;
  submittedReports: number;
  total: number;
}

export interface AnalyticsProjectRow {
  id: string;
  name: string;
  tasks: number;
  completed: number;
  inProgress: number;
  overdue: number;
  progress: number;
}

export interface AnalyticsWorkloadRow {
  id: string;
  name: string;
  kind: "team" | "workstream";
  people: number;
  tasks: number;
  overdue: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

export interface AnalyticsMemberWorkloadRow {
  uid: string;
  name: string;
  role: Role;
  ownedOpen: number;
  collaboratingOpen: number;
  completed: number;
  overdue: number;
}

export interface AnalyticsSnapshot {
  role: Role;
  rangeDays: 30 | 90;
  generatedAt: string;
  timeZone: string;
  tasks: {
    total: number;
    open: number;
    backlog: number;
    assigned: number;
    inProgress: number;
    inReview: number;
    blocked: number;
    completed: number;
    cancelled: number;
    overdue: number;
    dueSoon: number;
    completedInRange: number;
    teamVisible: number;
    priorities: Record<TaskPriority, number>;
  };
  projects: { active: number; rows: AnalyticsProjectRow[] };
  reports: {
    visible: number;
    draft: number;
    submitted: number;
    approved: number;
    needsRevision: number;
    awaitingReview: number;
    submittedInRange: number;
    activeReportingPeriods: number;
  };
  completionAndReportingTrend: AnalyticsTrendPoint[];
  activityHeatmap: AnalyticsHeatmapCell[];
  teamWorkload: AnalyticsWorkloadRow[];
  workstreamWorkload: AnalyticsWorkloadRow[];
  memberWorkload: AnalyticsMemberWorkloadRow[];
}

export interface AnalyticsInput {
  actor: { uid: string; role: Role };
  tasks: Task[];
  projects: Project[];
  reports: WorkReport[];
  reviewQueueCount: number;
  teams: AnalyticsScopeItem[];
  workstreams: AnalyticsScopeItem[];
  members?: { uid: string; name: string; role: Role }[];
  rangeDays: 30 | 90;
  nowMs?: number;
  timeZone?: string;
}

const DAY_MS = 86_400_000;
const TREND_BUCKETS = 8;

function inRange(iso: string | undefined, fromMs: number, toMs: number): boolean {
  if (!iso) return false;
  const value = Date.parse(iso);
  return Number.isFinite(value) && value >= fromMs && value <= toMs;
}

function dateKey(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatBucketLabel(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short" }).format(new Date(ms));
}

function trendIndex(iso: string | undefined, fromMs: number, toMs: number): number {
  if (!iso) return -1;
  const value = Date.parse(iso);
  if (!Number.isFinite(value) || value < fromMs || value > toMs) return -1;
  return Math.min(TREND_BUCKETS - 1, Math.floor(((value - fromMs) / Math.max(1, toMs - fromMs)) * TREND_BUCKETS));
}

function taskIsOpen(status: TaskStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}

function makeWorkload(items: AnalyticsScopeItem[], kind: "team" | "workstream", tasks: Task[], nowMs: number): AnalyticsWorkloadRow[] {
  const field = kind === "team" ? "teamId" : "workstreamId";
  return items.map((item) => {
    const related = tasks.filter((task) => task[field] === item.id);
    return {
      id: item.id,
      name: item.name,
      kind,
      people: item.memberCount,
      tasks: related.length,
      overdue: related.filter((task) => taskIsOpen(task.status) && !!task.dueAt && Date.parse(task.dueAt) < nowMs).length,
      inProgress: related.filter((task) => task.status === "in_progress").length,
      completed: related.filter((task) => task.status === "completed").length,
      cancelled: related.filter((task) => task.status === "cancelled").length,
    };
  }).sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name));
}

export function buildAnalyticsSnapshot(input: AnalyticsInput): AnalyticsSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const timeZone = input.timeZone ?? "Asia/Kolkata";
  const fromMs = nowMs - input.rangeDays * DAY_MS;
  const dueSoonUntil = nowMs + 7 * DAY_MS;

  // Members' personal totals exclude team-shared tasks they do not own or collaborate on.
  const personalTasks = input.actor.role === "member"
    ? input.tasks.filter((task) => task.accountableUserId === input.actor.uid || task.collaboratorUserIds.includes(input.actor.uid))
    : input.tasks;
  const teamVisible = input.actor.role === "member" ? input.tasks.length - personalTasks.length : 0;
  const tasks = personalTasks;
  const statusCount = (status: TaskStatus) => tasks.filter((task) => task.status === status).length;
  const completedInRange = tasks.filter((task) => task.status === "completed" && inRange(task.completedAt ?? task.updatedAt, fromMs, nowMs)).length;
  const overdue = tasks.filter((task) => taskIsOpen(task.status) && !!task.dueAt && Date.parse(task.dueAt) < nowMs).length;
  const dueSoon = tasks.filter((task) => {
    if (!taskIsOpen(task.status) || !task.dueAt) return false;
    const due = Date.parse(task.dueAt);
    return Number.isFinite(due) && due >= nowMs && due <= dueSoonUntil;
  }).length;

  const reports = input.reports.filter((report) => !report.deletedAt);
  const submitted = reports.filter((report) => report.status === "submitted").length;
  const trend = Array.from({ length: TREND_BUCKETS }, (_, index) => {
    const start = fromMs + ((nowMs - fromMs) / TREND_BUCKETS) * index;
    return { label: formatBucketLabel(start, timeZone), startAt: new Date(start).toISOString(), createdTasks: 0, completedTasks: 0, submittedReports: 0 };
  });
  for (const task of tasks) {
    const createdIndex = trendIndex(task.createdAt, fromMs, nowMs);
    if (createdIndex >= 0) trend[createdIndex]!.createdTasks++;
    if (task.status !== "completed") continue;
    const index = trendIndex(task.completedAt ?? task.updatedAt, fromMs, nowMs);
    if (index >= 0) trend[index]!.completedTasks++;
  }
  for (const report of reports) {
    if (!report.submittedAt) continue;
    const index = trendIndex(report.submittedAt, fromMs, nowMs);
    if (index >= 0) trend[index]!.submittedReports++;
  }

  const firstHeatmapDay = Date.parse(`${dateKey(fromMs, timeZone)}T00:00:00.000Z`);
  const lastHeatmapDay = Date.parse(`${dateKey(nowMs, timeZone)}T00:00:00.000Z`);
  const heatmap = new Map<string, AnalyticsHeatmapCell>();
  for (let day = firstHeatmapDay; day <= lastHeatmapDay; day += DAY_MS) {
    const date = new Date(day).toISOString().slice(0, 10);
    heatmap.set(date, { date, completedTasks: 0, submittedReports: 0, total: 0 });
  }
  for (const task of tasks) {
    if (task.status !== "completed") continue;
    const completedAt = task.completedAt ?? task.updatedAt;
    if (!inRange(completedAt, fromMs, nowMs)) continue;
    const cell = heatmap.get(dateKey(Date.parse(completedAt), timeZone));
    if (cell) cell.completedTasks++;
  }
  for (const report of reports) {
    if (!report.submittedAt || !inRange(report.submittedAt, fromMs, nowMs)) continue;
    const cell = heatmap.get(dateKey(Date.parse(report.submittedAt), timeZone));
    if (cell) cell.submittedReports++;
  }
  for (const cell of heatmap.values()) cell.total = cell.completedTasks + cell.submittedReports;

  const projects = input.projects.map((project) => {
    const related = tasks.filter((task) => task.projectId === project.id);
    const completed = related.filter((task) => task.status === "completed").length;
    return {
      id: project.id,
      name: project.name,
      tasks: related.length,
      completed,
      inProgress: related.filter((task) => task.status === "in_progress").length,
      overdue: related.filter((task) => taskIsOpen(task.status) && !!task.dueAt && Date.parse(task.dueAt) < nowMs).length,
      progress: related.length ? Math.round((completed / related.length) * 100) : 0,
    };
  }).sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name));

  const canShowTeamWorkload = input.actor.role !== "member";
  const teamWorkload = canShowTeamWorkload ? makeWorkload(input.teams, "team", input.tasks, nowMs) : [];
  const workstreamWorkload = canShowTeamWorkload ? makeWorkload(input.workstreams, "workstream", input.tasks, nowMs) : [];
  const visibleMembers = (input.members ?? []).filter((member) => input.actor.role !== "member" || member.uid === input.actor.uid);
  const memberWorkload = visibleMembers.map((member) => {
    const owned = input.tasks.filter((task) => task.accountableUserId === member.uid);
    const collaborating = input.tasks.filter((task) => task.collaboratorUserIds.includes(member.uid) && task.accountableUserId !== member.uid);
    const all = [...owned, ...collaborating];
    return {
      uid: member.uid,
      name: member.name,
      role: member.role,
      ownedOpen: owned.filter((task) => taskIsOpen(task.status)).length,
      collaboratingOpen: collaborating.filter((task) => taskIsOpen(task.status)).length,
      completed: all.filter((task) => task.status === "completed").length,
      overdue: all.filter((task) => taskIsOpen(task.status) && !!task.dueAt && Number.isFinite(Date.parse(task.dueAt)) && Date.parse(task.dueAt) < nowMs).length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    role: input.actor.role,
    rangeDays: input.rangeDays,
    generatedAt: new Date(nowMs).toISOString(),
    timeZone,
    tasks: {
      total: tasks.length,
      open: tasks.filter((task) => taskIsOpen(task.status)).length,
      backlog: statusCount("backlog"),
      assigned: statusCount("assigned"),
      inProgress: statusCount("in_progress"),
      inReview: statusCount("in_review"),
      blocked: statusCount("blocked"),
      completed: statusCount("completed"),
      cancelled: statusCount("cancelled"),
      overdue,
      dueSoon,
      completedInRange,
      teamVisible,
      priorities: {
        low: tasks.filter((task) => task.priority === "low").length,
        medium: tasks.filter((task) => task.priority === "medium").length,
        high: tasks.filter((task) => task.priority === "high").length,
        urgent: tasks.filter((task) => task.priority === "urgent").length,
      },
    },
    projects: { active: input.projects.filter((project) => project.status === "active").length, rows: projects },
    reports: {
      visible: reports.length,
      draft: reports.filter((report) => report.status === "draft").length,
      submitted,
      approved: reports.filter((report) => report.status === "approved").length,
      needsRevision: reports.filter((report) => report.status === "needs_revision").length,
      awaitingReview: input.reviewQueueCount,
      submittedInRange: reports.filter((report) => inRange(report.submittedAt, fromMs, nowMs)).length,
      activeReportingPeriods: trend.filter((point) => point.submittedReports > 0).length,
    },
    completionAndReportingTrend: trend,
    activityHeatmap: [...heatmap.values()],
    teamWorkload,
    workstreamWorkload,
    memberWorkload,
  };
}

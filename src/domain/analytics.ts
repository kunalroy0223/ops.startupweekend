import type { Project, Task, WorkReport, TaskStatus } from "./types";
import type { Role } from "./types";

export interface AnalyticsScopeItem {
  id: string;
  name: string;
  memberCount: number;
}

export interface AnalyticsTrendPoint {
  label: string;
  startAt: string;
  completedTasks: number;
  submittedReports: number;
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
  };
  projects: { active: number };
  reports: {
    visible: number;
    submitted: number;
    approved: number;
    needsRevision: number;
    awaitingReview: number;
    submittedInRange: number;
    activeReportingPeriods: number;
  };
  completionAndReportingTrend: AnalyticsTrendPoint[];
  teamWorkload: AnalyticsWorkloadRow[];
  workstreamWorkload: AnalyticsWorkloadRow[];
}

export interface AnalyticsInput {
  actor: { uid: string; role: Role };
  tasks: Task[];
  projects: Project[];
  reports: WorkReport[];
  reviewQueueCount: number;
  teams: AnalyticsScopeItem[];
  workstreams: AnalyticsScopeItem[];
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

function makeWorkload(
  items: AnalyticsScopeItem[],
  kind: "team" | "workstream",
  tasks: Task[],
  nowMs: number,
): AnalyticsWorkloadRow[] {
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
    };
  }).sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name));
}

export function buildAnalyticsSnapshot(input: AnalyticsInput): AnalyticsSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const timeZone = input.timeZone ?? "Asia/Kolkata";
  const fromMs = nowMs - input.rangeDays * DAY_MS;
  const dueSoonUntil = nowMs + 7 * DAY_MS;

  // Team Members can see team-shared tasks in the task register. Their personal
  // dashboard metrics intentionally count only tasks they own or collaborate on.
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
    return {
      label: formatBucketLabel(start, timeZone),
      startAt: new Date(start).toISOString(),
      completedTasks: 0,
      submittedReports: 0,
    };
  });

  for (const task of tasks) {
    if (task.status !== "completed") continue;
    const index = trendIndex(task.completedAt ?? task.updatedAt, fromMs, nowMs);
    if (index >= 0) trend[index]!.completedTasks++;
  }
  for (const report of reports) {
    // submittedAt remains on the record after approval or revision requests;
    // trend the submission event, not the current status.
    if (!report.submittedAt) continue;
    const index = trendIndex(report.submittedAt, fromMs, nowMs);
    if (index >= 0) trend[index]!.submittedReports++;
  }

  const canShowTeamWorkload = input.actor.role !== "member";
  const teamWorkload = canShowTeamWorkload ? makeWorkload(input.teams, "team", input.tasks, nowMs) : [];
  const workstreamWorkload = canShowTeamWorkload ? makeWorkload(input.workstreams, "workstream", input.tasks, nowMs) : [];

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
    },
    projects: { active: input.projects.filter((project) => project.status === "active").length },
    reports: {
      visible: reports.length,
      submitted,
      approved: reports.filter((report) => report.status === "approved").length,
      needsRevision: reports.filter((report) => report.status === "needs_revision").length,
      awaitingReview: input.reviewQueueCount,
      submittedInRange: reports.filter((report) => inRange(report.submittedAt, fromMs, nowMs)).length,
      activeReportingPeriods: trend.filter((point) => point.submittedReports > 0).length,
    },
    completionAndReportingTrend: trend,
    teamWorkload,
    workstreamWorkload,
  };
}

import { describe, expect, it } from "vitest";
import { buildAnalyticsSnapshot } from "@/domain/analytics";
import type { Project, Task, WorkReport } from "@/domain/types";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1", organizationId: "inhub", workspaceId: "workspace-1", title: "Task",
    accountableUserId: "member-1", collaboratorUserIds: [], status: "assigned", priority: "medium",
    dependencyIds: [], createdBy: "admin", updatedBy: "admin", createdAt: new Date(NOW - 10_000).toISOString(),
    updatedAt: new Date(NOW - 10_000).toISOString(), ...overrides,
  };
}

function report(overrides: Partial<WorkReport> = {}): WorkReport {
  return {
    id: "report-1", organizationId: "inhub", workspaceId: "workspace-1", userId: "member-1",
    reportDate: "2026-11-20", status: "submitted", submittedAt: new Date(NOW - 3 * 86_400_000).toISOString(),
    createdAt: new Date(NOW - 4 * 86_400_000).toISOString(), updatedAt: new Date(NOW - 3 * 86_400_000).toISOString(),
    version: 1, ...overrides,
  };
}

function build(role: "admin" | "lead" | "member", tasks: Task[], reports: WorkReport[] = []) {
  const projects: Project[] = [{
    id: "project-1", organizationId: "inhub", workspaceId: "workspace-1", name: "Project", slug: "project",
    status: "active", createdBy: "admin", createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
  }];
  return buildAnalyticsSnapshot({
    actor: { uid: "member-1", role }, tasks, projects, reports, reviewQueueCount: reports.filter((r) => r.status === "submitted" && r.userId !== "member-1").length,
    teams: [{ id: "team-1", name: "Testing", memberCount: 3 }],
    workstreams: [{ id: "stream-1", name: "Demo", memberCount: 4 }],
    rangeDays: 30, nowMs: NOW,
  });
}

describe("Module 7 analytics aggregation", () => {
  it("counts status, overdue, due-soon and completed-in-range work", () => {
    const snapshot = build("admin", [
      task({ id: "overdue", status: "in_progress", dueAt: new Date(NOW - DAY).toISOString() }),
      task({ id: "soon", status: "assigned", dueAt: new Date(NOW + DAY).toISOString() }),
      task({ id: "done", status: "completed", completedAt: new Date(NOW - DAY).toISOString() }),
      task({ id: "blocked", status: "blocked" }),
    ]);
    expect(snapshot.tasks.total).toBe(4);
    expect(snapshot.tasks.open).toBe(3);
    expect(snapshot.tasks.overdue).toBe(1);
    expect(snapshot.tasks.dueSoon).toBe(1);
    expect(snapshot.tasks.completedInRange).toBe(1);
    expect(snapshot.tasks.blocked).toBe(1);
  });

  it("limits Team Member personal metrics to owned or collaborated tasks", () => {
    const snapshot = build("member", [
      task({ id: "owned", accountableUserId: "member-1" }),
      task({ id: "collab", accountableUserId: "other", collaboratorUserIds: ["member-1"] }),
      task({ id: "team-shared", accountableUserId: "other", collaboratorUserIds: [], teamId: "team-1" }),
    ]);
    expect(snapshot.tasks.total).toBe(2);
    expect(snapshot.tasks.teamVisible).toBe(1);
    expect(snapshot.teamWorkload).toHaveLength(0);
  });

  it("keeps scoped workload distribution for Admin and Lead", () => {
    const snapshot = build("lead", [
      task({ id: "one", teamId: "team-1", workstreamId: "stream-1" }),
      task({ id: "two", teamId: "team-1", status: "completed" }),
    ]);
    expect(snapshot.teamWorkload[0]).toMatchObject({ name: "Testing", tasks: 2, completed: 1 });
    expect(snapshot.workstreamWorkload[0]).toMatchObject({ name: "Demo", tasks: 1 });
  });

  it("builds member workload from owned, collaborating and overdue tasks without ranking people", () => {
    const snapshot = buildAnalyticsSnapshot({
      actor: { uid: "admin", role: "admin" },
      tasks: [
        task({ id: "owned-open", accountableUserId: "member-1", dueAt: new Date(NOW - DAY).toISOString() }),
        task({ id: "collab-open", accountableUserId: "member-2", collaboratorUserIds: ["member-1"] }),
        task({ id: "owned-done", accountableUserId: "member-1", status: "completed" }),
      ],
      projects: [], reports: [], reviewQueueCount: 0, teams: [], workstreams: [],
      members: [{ uid: "member-1", name: "A Member", role: "member" }, { uid: "member-2", name: "B Member", role: "lead" }],
      rangeDays: 30, nowMs: NOW,
    });
    expect(snapshot.memberWorkload.find((row) => row.uid === "member-1")).toMatchObject({ ownedOpen: 1, collaboratingOpen: 1, completed: 1, overdue: 1 });
    expect(snapshot.memberWorkload).toHaveLength(2);
  });

  it("limits member workload visibility to the signed-in Team Member", () => {
    const snapshot = buildAnalyticsSnapshot({
      actor: { uid: "member-1", role: "member" },
      tasks: [task({ id: "self", accountableUserId: "member-1" }), task({ id: "other", accountableUserId: "member-2" })],
      projects: [], reports: [], reviewQueueCount: 0, teams: [], workstreams: [],
      members: [{ uid: "member-1", name: "Current member", role: "member" }, { uid: "member-2", name: "Another member", role: "member" }],
      rangeDays: 30, nowMs: NOW,
    });
    expect(snapshot.memberWorkload).toHaveLength(1);
    expect(snapshot.memberWorkload[0]?.uid).toBe("member-1");
  });

  it("aggregates report status and submission trends without inventing a compliance rate", () => {
    const snapshot = build("admin", [task()], [
      report({ id: "submitted", status: "submitted", userId: "other" }),
      report({ id: "approved", status: "approved", userId: "member-1" }),
      report({ id: "revision", status: "needs_revision", userId: "member-1" }),
    ]);
    expect(snapshot.reports.visible).toBe(3);
    expect(snapshot.reports.submittedInRange).toBe(3);
    expect(snapshot.reports.approved).toBe(1);
    expect(snapshot.reports.needsRevision).toBe(1);
    expect(snapshot.reports.awaitingReview).toBe(1);
    expect(snapshot.reports.activeReportingPeriods).toBeGreaterThan(0);
  });
});

describe("analytics visualisation datasets", () => {
  it("builds priority, project-progress and daily activity series from real records", () => {
    const completedAt = new Date(NOW - 2 * DAY).toISOString();
    const snapshot = build("admin", [
      task({ id: "urgent-done", projectId: "project-1", status: "completed", priority: "urgent", completedAt }),
      task({ id: "high-open", projectId: "project-1", status: "in_progress", priority: "high", dueAt: new Date(NOW + DAY).toISOString() }),
    ], [report({ submittedAt: completedAt })]);

    expect(snapshot.tasks.priorities).toEqual({ low: 0, medium: 0, high: 1, urgent: 1 });
    expect(snapshot.completionAndReportingTrend.reduce((sum, point) => sum + point.createdTasks, 0)).toBe(2);
    expect(snapshot.completionAndReportingTrend.reduce((sum, point) => sum + point.completedTasks, 0)).toBe(1);
    expect(snapshot.projects.rows[0]).toMatchObject({ tasks: 2, completed: 1, inProgress: 1, progress: 50 });
    const activeDay = snapshot.activityHeatmap.find((cell) => cell.date === completedAt.slice(0, 10));
    expect(activeDay?.completedTasks).toBe(1);
    expect(activeDay?.submittedReports).toBe(1);
    expect(activeDay?.total).toBe(2);
  });
});

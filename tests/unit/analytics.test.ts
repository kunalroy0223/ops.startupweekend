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

describe("Module 4 analytics aggregation", () => {
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

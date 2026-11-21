import "server-only";
import type { AnalyticsSnapshot } from "@/domain/analytics";
import { buildAnalyticsSnapshot } from "@/domain/analytics";
import type { Actor } from "@/domain/authz";
import type { WorkReport } from "@/domain/types";
import { col, fromDoc } from "../db";
import { serverEnv } from "../env";
import { listStructure } from "../queries";
import { listProjects, listTasks } from "./tasks";
import { canReviewReport, listMyReports } from "./work-reports";

const org = () => serverEnv().ORGANIZATION_ID;

async function reportsVisibleTo(actor: Actor): Promise<{ reports: WorkReport[]; reviewQueueCount: number }> {
  if (actor.role === "member") {
    return { reports: await listMyReports(actor), reviewQueueCount: 0 };
  }

  // Analytics needs historical approved/revision counts as well as the current
  // review queue. The query is organisation-scoped; only Admin or reports that
  // pass the same Lead review-scope service check are aggregated and returned.
  const snap = await col("workReports").where("organizationId", "==", org()).get();
  const all = snap.docs.map((doc) => fromDoc<WorkReport>(doc)).filter((report) => !report.deletedAt);
  if (actor.role === "admin") {
    const reports = all;
    return {
      reports,
      reviewQueueCount: reports.filter((report) => report.userId !== actor.uid && report.status === "submitted").length,
    };
  }

  const checks = await Promise.all(all.map(async (report) => ({
    report,
    allowed: report.userId === actor.uid || (report.status !== "draft" && await canReviewReport(actor, report)),
  })));
  const reports = checks.filter((entry) => entry.allowed).map((entry) => entry.report);
  return {
    reports,
    reviewQueueCount: reports.filter((report) => report.userId !== actor.uid && report.status === "submitted").length,
  };
}

export async function getAnalyticsOverview(
  actor: Actor,
  rangeDays: 30 | 90,
  timeZone = "Asia/Kolkata",
): Promise<AnalyticsSnapshot> {
  const [tasks, projects, structure, reportData] = await Promise.all([
    listTasks(actor),
    listProjects(actor),
    listStructure(actor),
    reportsVisibleTo(actor),
  ]);

  return buildAnalyticsSnapshot({
    actor: { uid: actor.uid, role: actor.role },
    tasks,
    projects,
    reports: reportData.reports,
    reviewQueueCount: reportData.reviewQueueCount,
    teams: structure.teams.map(({ id, name, memberCount }) => ({ id, name, memberCount })),
    workstreams: structure.workstreams.map(({ id, name, memberCount }) => ({ id, name, memberCount })),
    rangeDays,
    timeZone,
  });
}

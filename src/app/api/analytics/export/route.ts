import { requireApiActor, route } from "@/server/http";
import { getOrganization } from "@/server/queries";
import { getAnalyticsOverview } from "@/server/services/analytics";

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const GET = route(async (req) => {
  const actor = await requireApiActor(req);
  const rangeDays = req.nextUrl.searchParams.get("range") === "90" ? 90 : 30;
  const organization = await getOrganization();
  const data = await getAnalyticsOverview(actor, rangeDays, organization?.timezone ?? "Asia/Kolkata");
  const rows: Array<[string, string | number]> = [
    ["Metric", "Value"],
    ["Role", data.role],
    ["Range (days)", data.rangeDays],
    ["Generated at", data.generatedAt],
    ["Visible tasks", data.tasks.total],
    ["Open tasks", data.tasks.open],
    ["Overdue tasks", data.tasks.overdue],
    ["Due in 7 days", data.tasks.dueSoon],
    ["Blocked tasks", data.tasks.blocked],
    ["Completed in period", data.tasks.completedInRange],
    ["Active projects", data.projects.active],
    ["Reports visible", data.reports.visible],
    ["Reports submitted in period", data.reports.submittedInRange],
    ["Reports awaiting review", data.reports.awaitingReview],
    ["Reports approved", data.reports.approved],
    ["Reports needing revision", data.reports.needsRevision],
  ];
  for (const group of [...data.teamWorkload, ...data.workstreamWorkload]) {
    rows.push([`${group.kind}: ${group.name} — people`, group.people]);
    rows.push([`${group.kind}: ${group.name} — tasks`, group.tasks]);
    rows.push([`${group.kind}: ${group.name} — overdue`, group.overdue]);
    rows.push([`${group.kind}: ${group.name} — in progress`, group.inProgress]);
    rows.push([`${group.kind}: ${group.name} — completed`, group.completed]);
  }
  for (const point of data.completionAndReportingTrend) {
    rows.push([`Trend ${point.label} — task completions`, point.completedTasks]);
    rows.push([`Trend ${point.label} — report submissions`, point.submittedReports]);
  }
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inhub-analytics-${rangeDays}d.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
});

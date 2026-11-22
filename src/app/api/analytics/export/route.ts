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
    ["Low priority tasks", data.tasks.priorities.low],
    ["Medium priority tasks", data.tasks.priorities.medium],
    ["High priority tasks", data.tasks.priorities.high],
    ["Urgent priority tasks", data.tasks.priorities.urgent],
    ["Active projects", data.projects.active],
    ["Reports visible", data.reports.visible],
    ["Reports submitted in period", data.reports.submittedInRange],
    ["Reports awaiting review", data.reports.awaitingReview],
    ["Reports approved", data.reports.approved],
    ["Reports needing revision", data.reports.needsRevision],
  ];
  for (const member of data.memberWorkload) {
    rows.push([`Member ${member.name} — role`, member.role]);
    rows.push([`Member ${member.name} — owned open tasks`, member.ownedOpen]);
    rows.push([`Member ${member.name} — collaborating open tasks`, member.collaboratingOpen]);
    rows.push([`Member ${member.name} — completed tasks`, member.completed]);
    rows.push([`Member ${member.name} — overdue tasks`, member.overdue]);
  }
  for (const group of [...data.teamWorkload, ...data.workstreamWorkload]) {
    rows.push([`${group.kind}: ${group.name} — people`, group.people]);
    rows.push([`${group.kind}: ${group.name} — tasks`, group.tasks]);
    rows.push([`${group.kind}: ${group.name} — overdue`, group.overdue]);
    rows.push([`${group.kind}: ${group.name} — in progress`, group.inProgress]);
    rows.push([`${group.kind}: ${group.name} — completed`, group.completed]);
  }
  for (const project of data.projects.rows) {
    rows.push([`Project ${project.name} — tasks`, project.tasks]);
    rows.push([`Project ${project.name} — progress (%)`, project.progress]);
    rows.push([`Project ${project.name} — overdue`, project.overdue]);
  }
  for (const point of data.completionAndReportingTrend) {
    rows.push([`Trend ${point.label} — tasks created`, point.createdTasks]);
    rows.push([`Trend ${point.label} — task completions`, point.completedTasks]);
    rows.push([`Trend ${point.label} — report submissions`, point.submittedReports]);
  }
  for (const cell of data.activityHeatmap) {
    rows.push([`Activity ${cell.date} — tasks completed`, cell.completedTasks]);
    rows.push([`Activity ${cell.date} — reports submitted`, cell.submittedReports]);
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

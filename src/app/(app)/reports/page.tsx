import type { Metadata } from "next";
import { ReportIndex } from "@/components/reports/report-index";
import { isAdmin } from "@/domain/authz";
import { getOrganization, listStructure, listWorkspaces } from "@/server/queries";
import { listMyReports, listReviewQueue } from "@/server/services/work-reports";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Work reports" };
export const dynamic = "force-dynamic";

function todayInTimezone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function ReportsPage() {
  const { actor } = await requireActive();
  const [mine, reviewQueue, workspaces, structure, organization] = await Promise.all([
    listMyReports(actor), listReviewQueue(actor), listWorkspaces(actor), listStructure(actor), getOrganization(),
  ]);
  return <ReportIndex mine={mine} reviewQueue={reviewQueue} workspaces={workspaces.map(w => ({ id: w.id, name: w.name }))}
    teams={structure.teams} workstreams={structure.workstreams} today={todayInTimezone(organization?.timezone ?? "Asia/Kolkata")}
    canReview={isAdmin(actor) || actor.role === "lead"} adminView={isAdmin(actor)} />;
}

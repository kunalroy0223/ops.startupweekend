import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportDetail } from "@/components/reports/report-detail";
import { listStructure } from "@/server/queries";
import { listTasks } from "@/server/services/tasks";
import { getWorkReportDetail } from "@/server/services/work-reports";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Work report" };
export const dynamic = "force-dynamic";

export default async function WorkReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireActive();
  const { id } = await params;
  const [detail, tasks, structure] = await Promise.all([getWorkReportDetail(actor, id), listTasks(actor), listStructure(actor)]);
  if (!detail) notFound();
  const scopeNames = [
    detail.report.teamId ? structure.teams.find(t => t.id === detail.report.teamId)?.name : null,
    detail.report.workstreamId ? structure.workstreams.find(w => w.id === detail.report.workstreamId)?.name : null,
  ].filter((x): x is string => !!x);
  return <ReportDetail key={`${detail.report.id}:${detail.report.updatedAt}`} report={detail.report} initialEntries={detail.entries} reviews={detail.reviews} versions={detail.versions} authorDisplayName={detail.authorDisplayName} isAuthor={detail.report.userId === actor.uid}
    canEdit={detail.canEdit} canReview={detail.canReview} tasks={tasks} scopeNames={scopeNames} />;
}

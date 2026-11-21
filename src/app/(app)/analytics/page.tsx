import type { Metadata } from "next";
import { getOrganization } from "@/server/queries";
import { requireActive } from "@/server/session";
import { getAnalyticsOverview } from "@/server/services/analytics";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { actor } = await requireActive();
  const params = await searchParams;
  const rangeDays = params.range === "90" ? 90 : 30;
  const organization = await getOrganization();
  const analytics = await getAnalyticsOverview(actor, rangeDays, organization?.timezone ?? "Asia/Kolkata");
  return <AnalyticsDashboard analytics={analytics} />;
}

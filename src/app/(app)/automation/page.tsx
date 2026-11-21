import type { Metadata } from "next";
import { AutomationWorkspace } from "@/components/automation/automation-workspace";
import { listAutomationRules, listAutomationRuns } from "@/server/services/automation";
import { listNotificationDigests } from "@/server/services/digests";
import { listEmailDeliveries } from "@/server/services/email-deliveries";
import { listFailedDomainEvents } from "@/server/services/domain-events";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Automation" };
export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const { actor } = await requireActive();
  const [rules, runs, digests, deliveries, failedEvents] = await Promise.all([
    listAutomationRules(actor),
    listAutomationRuns(actor),
    listNotificationDigests(actor),
    listEmailDeliveries(actor),
    listFailedDomainEvents(actor),
  ]);
  return <AutomationWorkspace rules={rules} runs={runs} digests={digests} deliveries={deliveries} failedEvents={failedEvents} />;
}

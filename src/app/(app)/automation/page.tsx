import type { Metadata } from "next";
import { AutomationWorkspace } from "@/components/automation/automation-workspace";
import { listAutomationRules } from "@/server/services/automation";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Automation" };
export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const { actor } = await requireActive();
  const rules = await listAutomationRules(actor);
  return <AutomationWorkspace rules={rules} />;
}

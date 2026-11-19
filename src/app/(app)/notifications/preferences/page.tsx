import { SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { PageHeader } from "@/components/ui/page-header";
import { getPreferences } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Notification preferences" };

export default async function PreferencesPage() {
  const { actor } = await requireActive();
  const prefs = await getPreferences(actor);
  return (
    <div className="grid gap-6">
      <PageHeader icon={<SlidersHorizontal />} eyebrow="Notifications" title="Preferences" description="Choose how and when Inhub Workspace contacts you." />
      <PreferencesForm initial={prefs} />
    </div>
  );
}

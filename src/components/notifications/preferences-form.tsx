"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, Switch } from "@/components/ui/field";
import { Panel } from "@/components/ui/page-header";
import { useToast, FormError } from "@/components/ui/toast";
import { EVENT_CATALOGUE, EVENT_TYPES } from "@/domain/events";
import type { DeliveryMode } from "@/domain/types";
import { api, ApiClientError } from "@/lib/api";

export function PreferencesForm({ initial }: { initial: { inAppEnabled: boolean; emailEnabled: boolean; deliveryMode: DeliveryMode; disabledEventTypes: string[] } }) {
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const optional = EVENT_TYPES.filter((t) => !EVENT_CATALOGUE[t].essential);
  const essential = EVENT_TYPES.filter((t) => EVENT_CATALOGUE[t].essential);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/notifications/preferences", { method: "PUT", body: p });
      toast({ tone: "success", message: "Preferences saved." });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Panel>
        <h2 className="text-[15px] font-bold">Channels</h2>
        <div className="divide-y divide-line">
          <Switch label="In-app notifications" description="Shown in your inbox and on the bell." checked={p.inAppEnabled} onChange={(v) => setP({ ...p, inAppEnabled: v })} />
          <Switch label="Email notifications" description="Sent to your sign-in email address." checked={p.emailEnabled} onChange={(v) => setP({ ...p, emailEnabled: v })} />
          <div className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div>
              <label htmlFor="mode" className="text-sm font-semibold">Email timing</label>
              <p className="mt-0.5 text-[13px] text-fg-2">Daily digests start with Module 5. Until then, digest emails are held, not sent.</p>
            </div>
            <Select id="mode" value={p.deliveryMode} disabled={!p.emailEnabled} onChange={(e) => setP({ ...p, deliveryMode: e.target.value as DeliveryMode })} className="!w-48">
              <option value="immediate">Right away</option>
              <option value="daily_digest">Daily digest</option>
              <option value="off">Off</option>
            </Select>
          </div>
        </div>
      </Panel>
      <Panel>
        <h2 className="text-[15px] font-bold">What to tell you about</h2>
        <div className="divide-y divide-line">
          {optional.map((t) => (
            <Switch
              key={t}
              label={EVENT_CATALOGUE[t].label}
              description={EVENT_CATALOGUE[t].description}
              checked={!p.disabledEventTypes.includes(t)}
              onChange={(on) => setP({ ...p, disabledEventTypes: on ? p.disabledEventTypes.filter((x) => x !== t) : [...p.disabledEventTypes, t] })}
            />
          ))}
        </div>
        <div className="mt-4 rounded-[var(--radius-control)] bg-muted p-3">
          <p className="text-[13px] font-semibold">Always on</p>
          <p className="mt-0.5 text-xs text-fg-2">For your security, these are always sent: {essential.map((t) => EVENT_CATALOGUE[t].label.toLowerCase()).join(", ")}.</p>
        </div>
      </Panel>
      <FormError message={error} />
      <div><Button variant="primary" loading={busy} onClick={save}>Save preferences</Button></div>
    </div>
  );
}

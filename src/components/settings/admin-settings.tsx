"use client";
import { RefreshCw, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast, FormError } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/api";

const ZONES = ["Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Thimphu", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];

export function OrganizationForm({ name, timezone }: { name: string; timezone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [n, setN] = useState(name);
  const [tz, setTz] = useState(timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4 sm:max-w-md"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/organization", { method: "PATCH", body: { name: n, timezone: tz } });
          toast({ tone: "success", message: "Organisation settings saved." });
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiClientError ? err.message : "Couldn't save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Organisation name">{(p) => <Input {...p} value={n} onChange={(e) => setN(e.target.value)} />}</Field>
      <Field label="Time zone" hint="Used for dates, daily reports and reminders.">{(p) => <Select {...p} value={tz} onChange={(e) => setTz(e.target.value)}>{[...new Set([timezone, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}</Select>}</Field>
      <FormError message={error} />
      <div><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
    </form>
  );
}

export function DeliveryActions({ failed }: { failed: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(path: string, label: string) {
    setBusy(path);
    try {
      const r = await api<{ events?: Record<string, number>; emails?: Record<string, number>; requeued?: number }>(path, { method: "POST" });
      const msg = r.requeued !== undefined ? `${r.requeued} email${r.requeued === 1 ? "" : "s"} queued again.` : `Processed: ${Object.entries({ ...r.events, ...r.emails }).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing waiting"}.`;
      toast({ tone: "success", message: msg });
      router.refresh();
    } catch (err) {
      toast({ tone: "danger", message: err instanceof ApiClientError ? err.message : `${label} failed.` });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button icon={<RefreshCw className="size-4" />} loading={busy === "/api/ops/process-outbox"} onClick={() => run("/api/ops/process-outbox", "Processing")}>Process queue now</Button>
      <Button icon={<RotateCw className="size-4" />} disabled={!failed} loading={busy === "/api/ops/requeue-failed"} onClick={() => run("/api/ops/requeue-failed", "Retry")}>Retry failed emails</Button>
    </div>
  );
}

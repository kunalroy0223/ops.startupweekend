"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, Clock3, GitBranch, PauseCircle, PlayCircle, RefreshCw, Save, ShieldCheck } from "lucide-react";
import type { AutomationRun, AutomationTriggerType, DomainEvent, EmailDelivery, NotificationDigest } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";

type AutomationRuleView = {
  id: string;
  organizationId: string;
  ruleKey: string;
  label: string;
  description: string;
  triggerType: AutomationTriggerType;
  enabled: boolean;
  executionAvailable: boolean;
  unavailableReason?: string;
  config: Record<string, string | number | boolean | string[] | null>;
  schemaVersion: number;
  updatedAt?: string;
  updatedBy?: string;
};

type AutomationRunView = Pick<AutomationRun,
  "id" | "ruleKey" | "targetType" | "targetId" | "recipientUserId" | "status" | "attempts" | "lastErrorCode" | "createdAt" | "completedAt" | "nextRetryAt"
> & { workspaceId?: string };

type DigestView = Pick<NotificationDigest,
  "id" | "recipientUserId" | "digestDate" | "itemCount" | "status" | "attempts" | "lastErrorCode" | "createdAt" | "sentAt"
>;

type EmailDeliveryView = Pick<EmailDelivery,
  "id" | "recipientEmail" | "templateId" | "status" | "attempts" | "lastErrorCode" | "createdAt" | "providerMessageId"
>;

type FailedEventView = Pick<DomainEvent,
  "id" | "eventType" | "resourceType" | "resourceId" | "attempts" | "lastErrorCode" | "createdAt"
>;

const CONFIG_FIELDS: Record<string, { key: string; label: string; min: number; max: number; unit: string; hint: string }> = {
  task_due_soon: { key: "leadMinutes", label: "Reminder lead time", min: 15, max: 10_080, unit: "minutes before due time", hint: "15 minutes to 7 days before the task deadline. With the daily production schedule, a 24-hour lead time is the dependable baseline." },
  task_overdue: { key: "repeatHours", label: "Repeat interval", min: 24, max: 168, unit: "hours", hint: "Repeat overdue reminders between once a day and once a week." },
  crm_follow_up_due: { key: "repeatHours", label: "Repeat interval", min: 12, max: 168, unit: "hours", hint: "Repeat due follow-up reminders every 12 hours to 7 days." },
  crm_reply_waiting: { key: "waitHours", label: "Waiting threshold", min: 4, max: 168, unit: "hours without a response", hint: "Flag an inbound reply after 4 hours to 7 days." },
};

async function saveRule(ruleKey: string, enabled: boolean, config: Record<string, string | number | boolean | string[] | null>) {
  const response = await fetch(`/api/automation/rules/${encodeURIComponent(ruleKey)}`, {
    method: "PUT", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, config }),
  });
  const data = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? data.message ?? `Request failed (${response.status}).`);
}

function AutomationRuleCard({ rule }: { rule: AutomationRuleView }) {
  const router = useRouter();
  const toast = useToast();
  const field = CONFIG_FIELDS[rule.ruleKey];
  const value = Number(rule.config[field?.key ?? ""] ?? 0);
  const [draft, setDraft] = useState(String(value));
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  if (!field) return null;
  // Capture the narrowed field before using it inside event-handler closures.
  const configField = field;
  const dirty = draft !== String(value);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericValue = Number(draft);
    if (!Number.isInteger(numericValue) || numericValue < configField.min || numericValue > configField.max) {
      toast({ tone: "danger", message: `Enter a whole number from ${configField.min} to ${configField.max}.` });
      return;
    }
    setSaving(true);
    try {
      await saveRule(rule.ruleKey, enabled, { ...rule.config, [configField.key]: numericValue });
      toast({ tone: "success", message: `${rule.label} settings saved.` });
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not save automation settings." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule() {
    if (!rule.executionAvailable) return;
    setToggling(true);
    try {
      const next = !enabled;
      await saveRule(rule.ruleKey, next, { ...rule.config, [configField.key]: value });
      setEnabled(next);
      toast({ tone: "success", message: `${rule.label} ${next ? "enabled" : "paused"}.` });
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not update this automation rule." });
    } finally {
      setToggling(false);
    }
  }

  return (
    <Panel className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{rule.label}</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${enabled ? "border-success/50 bg-success/10 text-success" : "border-line bg-muted text-fg-3"}`}>{enabled ? "Enabled" : "Paused"}</span>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] text-fg-2">{rule.description}</p>
          {!rule.executionAvailable && <p className="mt-2 flex items-start gap-1.5 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{rule.unavailableReason ?? "This rule is not available yet."}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-fg-3"><Clock3 className="size-3.5" />Scheduled rule</span>
          <Button size="sm" variant={enabled ? "danger" : "secondary"} loading={toggling} disabled={!rule.executionAvailable} onClick={toggleRule}>{enabled ? "Pause" : "Enable"}</Button>
        </div>
      </div>
      <form onSubmit={onSubmit} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label={configField.label} hint={`${configField.hint} Current unit: ${configField.unit}.`}>{(props) => <Input {...props} type="number" inputMode="numeric" min={configField.min} max={configField.max} step={1} value={draft} onChange={(event) => setDraft(event.target.value)} />}</Field>
        <Button type="submit" variant="secondary" loading={saving} disabled={!dirty || !Number.isInteger(Number(draft))}><Save className="size-4" />Save configuration</Button>
      </form>
      <p className="text-[11px] text-fg-3">Last updated: {rule.updatedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(rule.updatedAt)) : "Default configuration"}</p>
    </Panel>
  );
}

function RunHistory({ runs, onRetry }: { runs: AutomationRunView[]; onRetry: (id: string) => Promise<void> }) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const toast = useToast();
  async function retry(id: string) {
    setRetryingId(id);
    try {
      await onRetry(id);
      toast({ tone: "success", message: "Failed automation run queued for retry." });
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not retry this run." });
    } finally {
      setRetryingId(null);
    }
  }
  return (
    <Panel>
      <SectionHeading title="Execution history" count={runs.length} icon={<Activity />} />
      {!runs.length ? <p className="text-sm text-fg-2">No automation runs yet. Enable a supported rule and run the evaluator to begin recording executions.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-fg-3"><th className="py-2 pr-3">Rule</th><th className="py-2 pr-3">Target</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Attempts</th><th className="py-2 pr-3">Last update</th><th className="py-2 text-right">Action</th></tr></thead>
            <tbody>{runs.map((run) => <tr key={run.id} className="border-b border-line/70 last:border-0">
              <td className="py-3 pr-3 font-semibold">{run.ruleKey.replaceAll("_", " ")}</td>
              <td className="py-3 pr-3 text-fg-2">{run.targetType} · {run.targetId.slice(0, 10)}</td>
              <td className="py-3 pr-3"><span className="inline-flex items-center gap-1.5 capitalize text-xs">{run.status === "completed" ? <CheckCircle2 className="size-3.5 text-success" /> : run.status === "failed" ? <AlertTriangle className="size-3.5 text-danger" /> : <Clock3 className="size-3.5 text-fg-3" />}{run.status}</span>{run.lastErrorCode ? <p className="mt-1 text-[10px] text-danger">{run.lastErrorCode}</p> : null}</td>
              <td className="py-3 pr-3 font-mono text-xs">{run.attempts}</td>
              <td className="py-3 pr-3 text-xs text-fg-2">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.completedAt ?? run.createdAt))}</td>
              <td className="py-3 text-right">{run.status === "failed" ? <Button size="sm" variant="secondary" loading={retryingId === run.id} onClick={() => retry(run.id)}><RefreshCw className="size-3.5" />Retry</Button> : <span className="text-xs text-fg-3">—</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}


function DigestHistory({ digests }: { digests: DigestView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const response = await fetch(`/api/notifications/digests/${encodeURIComponent(id)}/retry`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? `Request failed (${response.status}).`);
      toast({ tone: "success", message: "Daily digest queued for retry." });
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not retry this digest." });
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Panel>
      <SectionHeading title="Daily digest delivery" count={digests.length} icon={<Activity />} />
      {!digests.length ? <p className="text-sm text-fg-2">No daily digests have been queued yet. Digests are created for active users who choose Daily digest in notification preferences.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-fg-3"><th className="py-2 pr-3">Digest date</th><th className="py-2 pr-3">Recipient ID</th><th className="py-2 pr-3">Items</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Attempts</th><th className="py-2 text-right">Action</th></tr></thead>
            <tbody>{digests.map((digest) => <tr key={digest.id} className="border-b border-line/70 last:border-0">
              <td className="py-3 pr-3">{digest.digestDate}</td>
              <td className="py-3 pr-3 font-mono text-xs text-fg-2">{digest.recipientUserId.slice(0, 12)}</td>
              <td className="py-3 pr-3">{digest.itemCount}</td>
              <td className="py-3 pr-3"><span className="capitalize">{digest.status}</span>{digest.lastErrorCode ? <p className="mt-1 text-[10px] text-danger">{digest.lastErrorCode}</p> : null}</td>
              <td className="py-3 pr-3 font-mono text-xs">{digest.attempts ?? 0}</td>
              <td className="py-3 text-right">{digest.status === "failed" ? <Button size="sm" variant="secondary" loading={retryingId === digest.id} onClick={() => retry(digest.id)}><RefreshCw className="size-3.5" />Retry</Button> : <span className="text-xs text-fg-3">—</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}


function EmailDeliveryHistory({ deliveries }: { deliveries: EmailDeliveryView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const response = await fetch(`/api/notifications/email-deliveries/${encodeURIComponent(id)}/retry`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? `Request failed (${response.status}).`);
      toast({ tone: "success", message: "Email delivery queued for retry." });
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not retry this email." });
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Panel>
      <SectionHeading title="Email delivery history" count={deliveries.length} icon={<Activity />} />
      {!deliveries.length ? <p className="text-sm text-fg-2">No email deliveries have been recorded yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-fg-3"><th className="py-2 pr-3">Recipient</th><th className="py-2 pr-3">Template</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Attempts</th><th className="py-2 pr-3">Created</th><th className="py-2 text-right">Action</th></tr></thead>
            <tbody>{deliveries.map((delivery) => <tr key={delivery.id} className="border-b border-line/70 last:border-0">
              <td className="py-3 pr-3 text-fg-2">{delivery.recipientEmail}</td>
              <td className="py-3 pr-3">{delivery.templateId}</td>
              <td className="py-3 pr-3"><span className="capitalize">{delivery.status}</span>{delivery.lastErrorCode ? <p className="mt-1 text-[10px] text-danger">{delivery.lastErrorCode}</p> : null}</td>
              <td className="py-3 pr-3 font-mono text-xs">{delivery.attempts}</td>
              <td className="py-3 pr-3 text-xs text-fg-2">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(delivery.createdAt))}</td>
              <td className="py-3 text-right">{delivery.status === "failed" && delivery.lastErrorCode !== "recipient_no_longer_eligible" ? <Button size="sm" variant="secondary" loading={retryingId === delivery.id} onClick={() => retry(delivery.id)}><RefreshCw className="size-3.5" />Retry</Button> : <span className="text-xs text-fg-3">—</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}


function FailedEventHistory({ events }: { events: FailedEventView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const response = await fetch(`/api/notifications/events/${encodeURIComponent(id)}/retry`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? `Request failed (${response.status}).`);
      toast({ tone: "success", message: "Notification event queued for retry." });
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not retry this event." });
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Panel>
      <SectionHeading title="Failed notification events" count={events.length} icon={<AlertTriangle />} />
      {!events.length ? <p className="text-sm text-fg-2">No failed notification events. Events that exhaust automatic retries appear here for Admin review.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-fg-3"><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Resource</th><th className="py-2 pr-3">Error</th><th className="py-2 pr-3">Attempts</th><th className="py-2 pr-3">Created</th><th className="py-2 text-right">Action</th></tr></thead>
            <tbody>{events.map((event) => <tr key={event.id} className="border-b border-line/70 last:border-0">
              <td className="py-3 pr-3 font-semibold">{event.eventType.replaceAll("_", " ")}</td>
              <td className="py-3 pr-3 text-fg-2">{event.resourceType} · {event.resourceId.slice(0, 10)}</td>
              <td className="py-3 pr-3 text-xs text-danger">{event.lastErrorCode ?? "unknown_error"}</td>
              <td className="py-3 pr-3 font-mono text-xs">{event.attempts}</td>
              <td className="py-3 pr-3 text-xs text-fg-2">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</td>
              <td className="py-3 text-right"><Button size="sm" variant="secondary" loading={retryingId === event.id} onClick={() => retry(event.id)}><RefreshCw className="size-3.5" />Retry</Button></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function AutomationWorkspace({ rules, runs, digests, deliveries, failedEvents }: { rules: AutomationRuleView[]; runs: AutomationRunView[]; digests: DigestView[]; deliveries: EmailDeliveryView[]; failedEvents: FailedEventView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [processing, setProcessing] = useState(false);

  async function processNow() {
    setProcessing(true);
    try {
      const response = await fetch("/api/ops/process-automations", { method: "POST", credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({})) as { error?: { message?: string }; data?: unknown };
      if (!response.ok) throw new Error(data.error?.message ?? `Request failed (${response.status}).`);
      toast({ tone: "success", message: "Automation evaluator and notification queue processed." });
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not process automation rules." });
    } finally {
      setProcessing(false);
    }
  }

  async function retryRun(id: string) {
    const response = await fetch(`/api/automation/runs/${encodeURIComponent(id)}/retry`, { method: "POST", credentials: "same-origin", cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? `Request failed (${response.status}).`);
    router.refresh();
  }

  const activeCount = rules.filter((rule) => rule.enabled && rule.executionAvailable).length;
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="WORKFLOW OPERATIONS" title="Automation" description="Configure and monitor the organisation's scheduled workflow rules. Rule execution is scoped to supported task and notification workflows." icon={<GitBranch />} meta={<span className="inline-flex items-center gap-1.5 text-xs text-fg-2"><ShieldCheck className="size-3.5" />Admin-managed controls</span>} actions={<Button variant="primary" loading={processing} onClick={processNow}><PlayCircle className="size-4" />Run evaluator now</Button>} />
      <Panel className="border-warning/40 bg-warning/5"><div className="flex items-start gap-3"><PauseCircle className="mt-0.5 size-5 shrink-0 text-warning" /><div><h2 className="text-sm font-bold">Scheduled processing</h2><p className="mt-1 text-[13px] text-fg-2">The production scheduler runs daily. Use a 24-hour lead time for dependable due-soon reminders. Run evaluator now processes due rules and pending notification work immediately, which may send messages.</p><p className="mt-1 text-xs text-fg-3">{activeCount} supported rule{activeCount === 1 ? "" : "s"} enabled.</p></div></div></Panel>
      <div className="flex items-center justify-between gap-3"><SectionHeading title="Built-in rules" count={rules.length} /><span className="text-xs text-fg-3">Enable only supported rules</span></div>
      <div className="grid gap-4">{rules.map((rule) => <AutomationRuleCard key={rule.ruleKey} rule={rule} />)}</div>
      <RunHistory runs={runs} onRetry={retryRun} />
      <DigestHistory digests={digests} />
      <EmailDeliveryHistory deliveries={deliveries} />
      <FailedEventHistory events={failedEvents} />
    </div>
  );
}

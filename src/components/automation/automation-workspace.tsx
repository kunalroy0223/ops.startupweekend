"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Clock3, GitBranch, PauseCircle, Save, ShieldCheck } from "lucide-react";
import type { AutomationTriggerType } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";

type AutomationRuleView = {
  id: string; organizationId: string; ruleKey: string; label: string; description: string;
  triggerType: AutomationTriggerType; enabled: boolean;
  config: Record<string, string | number | boolean | string[] | null>;
  schemaVersion: number; updatedAt?: string | undefined; updatedBy?: string | undefined;
};

const CONFIG_FIELDS: Record<string, { key: string; label: string; min: number; max: number; unit: string; hint: string }> = {
  task_due_soon: { key: "leadMinutes", label: "Reminder lead time", min: 15, max: 10_080, unit: "minutes before due time", hint: "15 minutes to 7 days before the task deadline." },
  task_overdue: { key: "repeatHours", label: "Repeat interval", min: 24, max: 168, unit: "hours", hint: "Repeat overdue reminders between once a day and once a week." },
  crm_follow_up_due: { key: "repeatHours", label: "Repeat interval", min: 12, max: 168, unit: "hours", hint: "Repeat due follow-up reminders every 12 hours to 7 days." },
  crm_reply_waiting: { key: "waitHours", label: "Waiting threshold", min: 4, max: 168, unit: "hours without a response", hint: "Flag an inbound reply after 4 hours to 7 days." },
};

async function saveRule(ruleKey: string, config: Record<string, string | number | boolean | string[] | null>) {
  const response = await fetch(`/api/automation/rules/${encodeURIComponent(ruleKey)}`, {
    method: "PUT", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false, config }),
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
  const [saving, setSaving] = useState(false);
  if (!field) return null;
  // Capture the narrowed value before using it inside event-handler closures.
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
      await saveRule(rule.ruleKey, { ...rule.config, [configField.key]: numericValue });
      toast({ tone: "success", message: `${rule.label} settings saved.` });
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not save automation settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold">{rule.label}</h2><span className="rounded-full border border-warning/50 bg-warning/15 px-2 py-0.5 text-[11px] font-semibold">Not active</span></div><p className="mt-1 max-w-2xl text-[13px] text-fg-2">{rule.description}</p></div>
        <span className="inline-flex items-center gap-1.5 text-xs text-fg-3"><Clock3 className="size-3.5" />Scheduled rule</span>
      </div>
      <form onSubmit={onSubmit} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label={configField.label} hint={`${configField.hint} Current unit: ${configField.unit}.`}>{(props) => <Input {...props} type="number" inputMode="numeric" min={configField.min} max={configField.max} step={1} value={draft} onChange={(event) => setDraft(event.target.value)} />}</Field>
        <Button type="submit" variant="secondary" loading={saving} disabled={!dirty || !Number.isInteger(Number(draft))}><Save className="size-4" />Save configuration</Button>
      </form>
      <p className="text-[11px] text-fg-3">Last updated: {rule.updatedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(rule.updatedAt)) : "Default configuration"}</p>
    </Panel>
  );
}

export function AutomationWorkspace({ rules }: { rules: AutomationRuleView[] }) {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="WORKFLOW OPERATIONS" title="Automation" description="Configure the organisation's built-in workflow rules. Rules remain inactive until the scheduled evaluator and execution worker are deployed." icon={<GitBranch />} meta={<span className="inline-flex items-center gap-1.5 text-xs text-fg-2"><ShieldCheck className="size-3.5" />Admin-managed configuration</span>} />
      <Panel className="border-warning/40 bg-warning/5"><div className="flex items-start gap-3"><PauseCircle className="mt-0.5 size-5 shrink-0 text-warning" /><div><h2 className="text-sm font-bold">Execution engine not deployed</h2><p className="mt-1 text-[13px] text-fg-2">You can review and save rule settings, but these rules cannot run yet. Enabling is intentionally unavailable so the interface cannot imply that reminders or CRM automations are executing.</p></div></div></Panel>
      <div className="flex items-center justify-between gap-3"><SectionHeading title="Built-in rules" count={rules.length} /><span className="text-xs text-fg-3">Configuration only</span></div>
      <div className="grid gap-4">{rules.map((rule) => <AutomationRuleCard key={rule.ruleKey} rule={rule} />)}</div>
      <Panel><SectionHeading title="Execution history" icon={<GitBranch />} /><p className="text-sm text-fg-2">Execution history and retry controls will become available with the evaluator worker. The current deployment provides idempotent run-claim and completion primitives, but no scheduled evaluator or run-history API.</p></Panel>
    </div>
  );
}

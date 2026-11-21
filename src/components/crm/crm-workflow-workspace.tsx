"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { CRM_CAMPAIGN_MEMBER_STAGES, PARTNERSHIP_PIPELINE_STAGES } from "@/domain/crm-workflows";
import type { CrmAccount, CrmActivity, CrmCampaign, CrmCampaignMember, CrmContact, CrmOpportunity, Role, Task } from "@/domain/types";

interface PersonOption { uid: string; displayName: string; email: string }
interface Props {
  workspaceId: string;
  workspaceName: string;
  workspaces: { id: string; name: string }[];
  initialCampaignId?: string;
  initialMemberId?: string;
  role: Role;
  currentUserId: string;
  people: PersonOption[];
  accounts: CrmAccount[];
  contacts: CrmContact[];
  opportunities: CrmOpportunity[];
  campaigns: CrmCampaign[];
  members: CrmCampaignMember[];
  activities: CrmActivity[];
  tasks: Task[];
}

type Tab = "pipeline" | "campaigns" | "followups" | "activity";

async function requestJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string }; message?: string };
  if (!response.ok) throw new Error(payload.error?.message ?? payload.message ?? `Request failed (${response.status}).`);
  return payload;
}

function labelize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value?: string): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not set" : parsed.toLocaleString();
}

function toLocalInput(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${tone === "error" ? "border-danger/40 bg-danger/5 text-danger" : "border-line bg-muted text-fg-2"}`}>{children}</p>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-fg-2">{children}</p>;
}

export function CrmWorkflowWorkspace(props: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(props.initialMemberId ? "campaigns" : "pipeline");
  const [selectedCampaignId, setSelectedCampaignId] = useState(props.initialCampaignId && props.campaigns.some((campaign) => campaign.id === props.initialCampaignId) ? props.initialCampaignId : props.campaigns[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const [taskLinkDrafts, setTaskLinkDrafts] = useState<Record<string, string>>({});
  const isAdmin = props.role === "admin";
  const canCreate = props.role !== "member";
  const campaignById = useMemo(() => new Map(props.campaigns.map((campaign) => [campaign.id, campaign])), [props.campaigns]);
  const memberById = useMemo(() => new Map(props.members.map((member) => [member.id, member])), [props.members]);
  const contactById = useMemo(() => new Map(props.contacts.map((contact) => [contact.id, contact])), [props.contacts]);
  const accountById = useMemo(() => new Map(props.accounts.map((account) => [account.id, account])), [props.accounts]);
  const personById = useMemo(() => new Map(props.people.map((person) => [person.uid, person.displayName])), [props.people]);
  const selectedCampaign = campaignById.get(selectedCampaignId);
  const campaignMembers = props.members.filter((member) => member.campaignId === selectedCampaignId);
  const openFollowUps = props.members
    .filter((member) => member.nextFollowUpAt && !["converted", "not_interested", "do_not_contact"].includes(member.stage))
    .sort((a, b) => Date.parse(a.nextFollowUpAt ?? "") - Date.parse(b.nextFollowUpAt ?? ""));

  async function mutate<T>(operation: () => Promise<T>, success: string) {
    setSaving(true);
    setNotice(null);
    try {
      await operation();
      setNotice({ message: success, error: false });
      router.refresh();
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "Something went wrong.", error: true });
    } finally {
      setSaving(false);
    }
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(async () => {
      await requestJson("/api/crm/opportunities", "POST", {
        workspaceId: props.workspaceId,
        title: String(form.get("title") ?? ""),
        opportunityType: String(form.get("opportunityType") ?? "other"),
        accountId: String(form.get("accountId") ?? "") || undefined,
        primaryContactId: String(form.get("primaryContactId") ?? "") || undefined,
        ownerUserId: String(form.get("ownerUserId") ?? "") || undefined,
        expectedValue: form.get("expectedValue") ? Number(form.get("expectedValue")) : undefined,
        currency: String(form.get("currency") ?? "INR") || undefined,
        expectedDecisionAt: toIso(String(form.get("expectedDecisionAt") ?? "")) ?? undefined,
        contributionDescription: String(form.get("contributionDescription") ?? "") || undefined,
        nextStep: String(form.get("nextStep") ?? "") || undefined,
      });
    }, "Opportunity created.");
  }

  async function updateOpportunityStage(id: string, stageKey: string) {
    const outcomeReason = ["won", "lost"].includes(stageKey) ? window.prompt(`Reason for marking this opportunity ${stageKey}?`) : undefined;
    if (["won", "lost"].includes(stageKey) && !outcomeReason?.trim()) return;
    await mutate(() => requestJson(`/api/crm/opportunities/${id}`, "PATCH", { stageKey, ...(outcomeReason ? { outcomeReason } : {}) }), "Opportunity stage updated.");
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(async () => {
      const result = await requestJson<{ id: string }>("/api/crm/campaigns", "POST", {
        workspaceId: props.workspaceId,
        name: String(form.get("name") ?? ""),
        objective: String(form.get("objective") ?? ""),
        campaignType: String(form.get("campaignType") ?? "other"),
        channel: String(form.get("channel") ?? "other"),
        ownerUserId: String(form.get("ownerUserId") ?? "") || undefined,
        startAt: toIso(String(form.get("startAt") ?? "")) ?? undefined,
        endAt: toIso(String(form.get("endAt") ?? "")) ?? undefined,
        tags: String(form.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setSelectedCampaignId(result.id);
    }, "Campaign created. Activate it before enrolling contacts.");
  }

  async function setCampaignStatus(campaign: CrmCampaign, status: CrmCampaign["status"]) {
    await mutate(() => requestJson(`/api/crm/campaigns/${campaign.id}`, "PATCH", { status }), `Campaign ${labelize(status).toLowerCase()}.`);
  }

  async function enrolContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!selectedCampaignId) return;
    await mutate(async () => {
      await requestJson(`/api/crm/campaigns/${selectedCampaignId}/members`, "POST", {
        contactId: String(form.get("contactId") ?? ""),
        assignedToUserId: String(form.get("assignedToUserId") ?? "") || undefined,
      });
    }, "Contact enrolled in campaign.");
  }

  async function updateMember(id: string, patch: Record<string, unknown>, success: string) {
    await mutate(() => requestJson(`/api/crm/campaign-members/${id}`, "PATCH", patch), success);
  }

  async function saveLinkedTask(member: CrmCampaignMember) {
    const value = taskLinkDrafts[member.id] ?? member.linkedFollowUpTaskId ?? "";
    await updateMember(member.id, { linkedFollowUpTaskId: value || null }, value ? "Follow-up task linked." : "Follow-up task unlinked.");
  }

  async function logActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextFollowUpAt = toIso(String(form.get("nextFollowUpAt") ?? ""));
    await mutate(async () => {
      await requestJson("/api/crm/activities", "POST", {
        campaignMemberId: String(form.get("campaignMemberId") ?? "") || undefined,
        opportunityId: String(form.get("opportunityId") ?? "") || undefined,
        activityType: String(form.get("activityType") ?? "note"),
        channel: String(form.get("channel") ?? "internal"),
        direction: String(form.get("direction") ?? "internal"),
        occurredAt: toIso(String(form.get("occurredAt") ?? "")) ?? undefined,
        summary: String(form.get("summary") ?? ""),
        outcome: String(form.get("outcome") ?? "") || undefined,
        ...(nextFollowUpAt !== null ? { nextFollowUpAt } : {}),
      });
    }, "Interaction logged to the CRM timeline.");
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "pipeline", label: "Partnership pipeline", count: props.opportunities.length },
    { key: "campaigns", label: "Campaigns", count: props.campaigns.length },
    { key: "followups", label: "Follow-ups", count: openFollowUps.length },
    { key: "activity", label: "Activity log", count: props.activities.length },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="RELATIONSHIP OPERATIONS" title="CRM workflows" description={`Manage partnership opportunities, campaign outreach, follow-ups and relationship history in ${props.workspaceName}.`}
        actions={props.workspaces.length > 1 ? <Field label="Workspace">{(p) => <Select {...p} value={props.workspaceId} onChange={(event) => router.push(`/crm/workflows?workspaceId=${encodeURIComponent(event.target.value)}`)}>{props.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select>}</Field> : undefined} />
      {notice ? <Notice tone={notice.error ? "error" : "info"}>{notice.message}</Notice> : null}
      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-muted p-1" role="tablist" aria-label="CRM workflows">
        {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === item.key ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>{item.label}<span className="ml-2 font-mono text-xs text-fg-3">{item.count}</span></button>)}
      </div>

      {tab === "pipeline" ? <>
        {canCreate ? <Panel><SectionHeading title="Create partnership opportunity" /><form onSubmit={createOpportunity} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Opportunity title" required>{(p) => <Input {...p} name="title" required minLength={2} maxLength={160} placeholder="e.g. Annual event sponsorship" />}</Field>
          <Field label="Opportunity type" required>{(p) => <Select {...p} name="opportunityType" defaultValue="sponsorship"><option value="sponsorship">Sponsorship</option><option value="institutional_partnership">Institutional partnership</option><option value="mentor">Mentor</option><option value="speaker">Speaker</option><option value="judge">Judge</option><option value="community">Community</option><option value="collaboration">Collaboration</option><option value="other">Other</option></Select>}</Field>
          <Field label="Account">{(p) => <Select {...p} name="accountId" defaultValue=""><option value="">No linked account</option>{props.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select>}</Field>
          <Field label="Primary contact">{(p) => <Select {...p} name="primaryContactId" defaultValue=""><option value="">No primary contact</option>{props.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</Select>}</Field>
          {isAdmin ? <Field label="Owner">{(p) => <Select {...p} name="ownerUserId" defaultValue=""><option value="">You</option>{props.people.map((person) => <option key={person.uid} value={person.uid}>{person.displayName}</option>)}</Select>}</Field> : null}
          <Field label="Expected value">{(p) => <Input {...p} name="expectedValue" type="number" min="0" step="0.01" placeholder="0.00" />}</Field>
          <Field label="Currency">{(p) => <Select {...p} name="currency" defaultValue="INR"><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></Select>}</Field>
          <Field label="Expected decision date">{(p) => <Input {...p} name="expectedDecisionAt" type="datetime-local" />}</Field>
          <Field label="Next step">{(p) => <Input {...p} name="nextStep" placeholder="Share proposal, schedule meeting…" maxLength={1000} />}</Field>
          <Field label="Contribution / value description" className="sm:col-span-2 xl:col-span-3">{(p) => <Textarea {...p} name="contributionDescription" rows={2} maxLength={2000} />}</Field>
          <div className="sm:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit" loading={saving}>Create opportunity</Button></div>
        </form></Panel> : null}
        <Panel><SectionHeading title="Partnership pipeline" count={props.opportunities.length} />
          {props.opportunities.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-line text-xs text-fg-3"><th className="px-3 py-2">Opportunity</th><th className="px-3 py-2">Account / contact</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Stage</th></tr></thead><tbody>{props.opportunities.map((item) => <tr key={item.id} className="border-b border-line last:border-0"><td className="px-3 py-3"><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-fg-3">{labelize(item.opportunityType)} · updated {dateLabel(item.updatedAt)}</p></td><td className="px-3 py-3 text-fg-2">{item.accountId ? accountById.get(item.accountId)?.name ?? "Linked account" : "—"}<p className="text-xs text-fg-3">{item.primaryContactId ? contactById.get(item.primaryContactId)?.displayName ?? "Primary contact" : "No primary contact"}</p></td><td className="px-3 py-3 text-fg-2">{personById.get(item.ownerUserId) ?? (item.ownerUserId === props.currentUserId ? "You" : "Assigned user")}</td><td className="px-3 py-3 tabular-nums">{item.expectedValue !== undefined && item.expectedValue !== null ? `${item.currency ?? "INR"} ${Number(item.expectedValue).toLocaleString()}` : "—"}</td><td className="px-3 py-3"><Select aria-label={`Stage for ${item.title}`} className="min-w-36" value={item.stageKey} disabled={saving || (!isAdmin && item.ownerUserId !== props.currentUserId)} onChange={(event) => void updateOpportunityStage(item.id, event.target.value)}>{PARTNERSHIP_PIPELINE_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</Select></td></tr>)}</tbody></table></div> : <Empty>No partnership opportunities yet. Create the first opportunity to start tracking a relationship.</Empty>}
        </Panel>
      </> : null}

      {tab === "campaigns" ? <>
        {canCreate ? <Panel><SectionHeading title="Create outreach campaign" /><form onSubmit={createCampaign} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Campaign name" required>{(p) => <Input {...p} name="name" required maxLength={160} placeholder="e.g. Startup Weekend sponsors" />}</Field>
          <Field label="Campaign type" required>{(p) => <Select {...p} name="campaignType" defaultValue="partnership_acquisition"><option value="partnership_acquisition">Partnership acquisition</option><option value="instagram_outreach">Instagram outreach</option><option value="mentor_acquisition">Mentor acquisition</option><option value="community_engagement">Community engagement</option><option value="other">Other</option></Select>}</Field>
          <Field label="Primary channel" required>{(p) => <Select {...p} name="channel" defaultValue="email"><option value="email">Email</option><option value="instagram">Instagram</option><option value="phone">Phone</option><option value="in_person">In person</option><option value="event">Event</option><option value="referral">Referral</option><option value="other">Other</option></Select>}</Field>
          <Field label="Start">{(p) => <Input {...p} name="startAt" type="datetime-local" />}</Field>
          <Field label="End">{(p) => <Input {...p} name="endAt" type="datetime-local" />}</Field>
          {isAdmin ? <Field label="Owner">{(p) => <Select {...p} name="ownerUserId" defaultValue=""><option value="">You</option>{props.people.map((person) => <option key={person.uid} value={person.uid}>{person.displayName}</option>)}</Select>}</Field> : null}
          <Field label="Objective" className="sm:col-span-2 xl:col-span-3" required>{(p) => <Textarea {...p} name="objective" required rows={2} maxLength={2000} placeholder="What outcome should this campaign achieve?" />}</Field>
          <Field label="Tags" hint="Comma-separated, optional." className="sm:col-span-2 xl:col-span-3">{(p) => <Input {...p} name="tags" maxLength={1200} />}</Field>
          <div className="sm:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit" loading={saving}>Create campaign</Button></div>
        </form></Panel> : null}
        <Panel><SectionHeading title="Campaign register" count={props.campaigns.length} />
          {props.campaigns.length ? <div className="grid gap-3 md:grid-cols-2">{props.campaigns.map((campaign) => <article key={campaign.id} className={`rounded-xl border p-4 ${campaign.id === selectedCampaignId ? "border-line-strong bg-muted/60" : "border-line"}`}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{campaign.name}</h3><p className="mt-1 text-xs text-fg-2">{labelize(campaign.campaignType)} · {labelize(campaign.channel)} · {personById.get(campaign.ownerUserId) ?? "Assigned owner"}</p></div><Badge>{labelize(campaign.status)}</Badge></div>
            <p className="mt-3 text-sm text-fg-2">{campaign.objective}</p><p className="mt-2 text-xs text-fg-3">{dateLabel(campaign.startAt)} — {dateLabel(campaign.endAt)}</p>
            <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant={campaign.id === selectedCampaignId ? "primary" : "secondary"} onClick={() => setSelectedCampaignId(campaign.id)}>Manage contacts</Button>{(isAdmin || campaign.ownerUserId === props.currentUserId) && campaign.status !== "archived" ? <Select aria-label={`Status for ${campaign.name}`} className="h-8 max-w-36" value={campaign.status} disabled={saving} onChange={(event) => void setCampaignStatus(campaign, event.target.value as CrmCampaign["status"])}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></Select> : null}</div>
          </article>)}</div> : <Empty>No campaigns yet. Create a campaign to organise outreach.</Empty>}
        </Panel>
        {selectedCampaign ? <Panel><SectionHeading title={`Campaign contacts · ${selectedCampaign.name}`} count={campaignMembers.length} />
          {selectedCampaign.status === "active" && (isAdmin || selectedCampaign.ownerUserId === props.currentUserId) ? <form onSubmit={enrolContact} className="mb-4 grid gap-3 rounded-lg bg-muted p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Contact to enrol" required>{(p) => <Select {...p} name="contactId" required defaultValue=""><option value="">Choose a contact</option>{props.contacts.filter((contact) => !contact.doNotContact && !campaignMembers.some((member) => member.contactId === contact.id)).map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}</Select>}</Field>
            {isAdmin ? <Field label="Assign to">{(p) => <Select {...p} name="assignedToUserId" defaultValue=""><option value="">Campaign owner</option>{props.people.map((person) => <option key={person.uid} value={person.uid}>{person.displayName}</option>)}</Select>}</Field> : null}
            <Button type="submit" loading={saving}>Enrol contact</Button>
          </form> : <Notice>Activate this campaign to enrol contacts. Only the campaign owner or an Admin can manage enrolment.</Notice>}
          {campaignMembers.length ? <div className="grid gap-2">{campaignMembers.map((member) => {
            const contact = contactById.get(member.contactId);
            const canManageMember = isAdmin || member.assignedToUserId === props.currentUserId || selectedCampaign.ownerUserId === props.currentUserId;
            const linkedTasks = props.tasks.filter((task) => task.workspaceId === props.workspaceId && (task.accountableUserId === member.assignedToUserId || task.collaboratorUserIds.includes(member.assignedToUserId)));
            return <div key={member.id} id={member.id} className={`grid gap-3 rounded-lg border p-3 ${props.initialMemberId === member.id ? "border-line-strong bg-muted/60" : "border-line"}`}>
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div><p className="font-semibold">{contact?.displayName ?? "Contact unavailable"}</p><p className="text-xs text-fg-3">Assigned to {personById.get(member.assignedToUserId) ?? "Assigned user"} · {member.nextFollowUpAt ? `Follow-up ${dateLabel(member.nextFollowUpAt)}` : "No follow-up scheduled"}</p>{contact?.doNotContact ? <span className="mt-1 inline-block text-xs font-semibold text-danger">Do not contact</span> : null}</div>
                <Select aria-label={`Campaign stage for ${contact?.displayName ?? "contact"}`} className="min-w-40" value={member.stage} disabled={saving || !canManageMember} onChange={(event) => void updateMember(member.id, { stage: event.target.value }, "Campaign contact stage updated.")}>{CRM_CAMPAIGN_MEMBER_STAGES.map((stage) => <option key={stage} value={stage}>{labelize(stage)}</option>)}</Select>
                <div className="flex items-center gap-2"><Input aria-label={`Follow-up date for ${contact?.displayName ?? "contact"}`} type="datetime-local" className="min-w-48" disabled={!canManageMember} value={followUpDrafts[member.id] ?? toLocalInput(member.nextFollowUpAt)} onChange={(event) => setFollowUpDrafts((prev) => ({ ...prev, [member.id]: event.target.value }))} /><Button size="sm" disabled={saving || !canManageMember} onClick={() => void updateMember(member.id, { nextFollowUpAt: toIso(followUpDrafts[member.id] ?? "") }, "Follow-up schedule updated.")}>Save date</Button></div>
              </div>
              <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Linked follow-up task" hint="Link an existing open task assigned to or shared with this contact owner.">{(p) => <Select {...p} value={taskLinkDrafts[member.id] ?? member.linkedFollowUpTaskId ?? ""} disabled={!canManageMember || saving} onChange={(event) => setTaskLinkDrafts((prev) => ({ ...prev, [member.id]: event.target.value }))}>
                  <option value="">No linked task</option>
                  {member.linkedFollowUpTaskId && !linkedTasks.some((task) => task.id === member.linkedFollowUpTaskId) ? <option value={member.linkedFollowUpTaskId}>Linked task (not available in this view)</option> : null}
                  {linkedTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </Select>}</Field>
                <Button size="sm" variant="secondary" disabled={!canManageMember || saving} onClick={() => void saveLinkedTask(member)}>Save task link</Button>
              </div>
            </div>;
          })}</div> : <Empty>No contacts are enrolled in this campaign yet.</Empty>}
        </Panel> : null}
      </> : null}

      {tab === "followups" ? <Panel><SectionHeading title="Scheduled CRM follow-ups" count={openFollowUps.length} />
        {openFollowUps.length ? <div className="grid gap-2">{openFollowUps.map((member) => { const contact = contactById.get(member.contactId); const campaign = campaignById.get(member.campaignId); const canManage = isAdmin || member.assignedToUserId === props.currentUserId || campaign?.ownerUserId === props.currentUserId; return <div key={member.id} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-[1fr_auto_auto] md:items-center"><div><p className="font-semibold">{contact?.displayName ?? "Contact unavailable"}</p><p className="text-xs text-fg-2">{campaign?.name ?? "Campaign"} · {labelize(member.stage)} · Owner: {personById.get(member.assignedToUserId) ?? "Assigned user"}</p><p className="mt-1 text-xs text-fg-3">Due {dateLabel(member.nextFollowUpAt)}</p></div><Input aria-label={`Reschedule ${contact?.displayName ?? "contact"}`} type="datetime-local" className="min-w-48" disabled={!canManage} value={followUpDrafts[member.id] ?? toLocalInput(member.nextFollowUpAt)} onChange={(event) => setFollowUpDrafts((prev) => ({ ...prev, [member.id]: event.target.value }))} /><div className="flex gap-2"><Button size="sm" disabled={saving || !canManage} onClick={() => void updateMember(member.id, { nextFollowUpAt: toIso(followUpDrafts[member.id] ?? "") }, "Follow-up rescheduled.")}>Reschedule</Button><Button size="sm" variant="ghost" disabled={saving || !canManage} onClick={() => void updateMember(member.id, { nextFollowUpAt: null }, "Follow-up cleared.")}>Clear</Button></div></div>; })}</div> : <Empty>No active follow-ups are scheduled. Set a next follow-up date on an enrolled campaign contact.</Empty>}
      </Panel> : null}

      {tab === "activity" ? <>
        <Panel><SectionHeading title="Log a relationship interaction" /><form onSubmit={logActivity} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Campaign contact">{(p) => <Select {...p} name="campaignMemberId" defaultValue=""><option value="">No campaign contact</option>{props.members.map((member) => <option key={member.id} value={member.id}>{contactById.get(member.contactId)?.displayName ?? "Contact"} · {campaignById.get(member.campaignId)?.name ?? "Campaign"}</option>)}</Select>}</Field>
          <Field label="Opportunity">{(p) => <Select {...p} name="opportunityId" defaultValue=""><option value="">No opportunity</option>{props.opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select>}</Field>
          <Field label="Interaction type" required>{(p) => <Select {...p} name="activityType" defaultValue="note"><option value="researched">Researched</option><option value="qualified">Qualified</option><option value="initial_outreach">Initial outreach</option><option value="reply_received">Reply received</option><option value="follow_up_sent">Follow-up sent</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="proposal_shared">Proposal shared</option><option value="outcome_recorded">Outcome recorded</option><option value="note">Note</option></Select>}</Field>
          <Field label="Channel" required>{(p) => <Select {...p} name="channel" defaultValue="internal"><option value="instagram">Instagram</option><option value="email">Email</option><option value="phone">Phone</option><option value="meeting">Meeting</option><option value="in_person">In person</option><option value="internal">Internal</option><option value="other">Other</option></Select>}</Field>
          <Field label="Direction">{(p) => <Select {...p} name="direction" defaultValue="internal"><option value="internal">Internal</option><option value="outbound">Outbound</option><option value="inbound">Inbound</option></Select>}</Field>
          <Field label="Occurred at">{(p) => <Input {...p} name="occurredAt" type="datetime-local" />}</Field>
          <Field label="Next follow-up">{(p) => <Input {...p} name="nextFollowUpAt" type="datetime-local" />}</Field>
          <Field label="Summary" className="sm:col-span-2 xl:col-span-3" required>{(p) => <Textarea {...p} name="summary" required rows={3} maxLength={2000} placeholder="Record what happened, what was discussed and the agreed next step." />}</Field>
          <Field label="Outcome" className="sm:col-span-2 xl:col-span-3">{(p) => <Input {...p} name="outcome" maxLength={1000} placeholder="Optional outcome or response received" />}</Field>
          <div className="sm:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit" loading={saving}>Log activity</Button></div>
        </form></Panel>
        <Panel><SectionHeading title="Relationship activity timeline" count={props.activities.length} />
          {props.activities.length ? <div className="divide-y divide-line">{props.activities.map((activity) => {
            const member = activity.campaignMemberId ? memberById.get(activity.campaignMemberId) : undefined;
            const opportunity = activity.opportunityId ? props.opportunities.find((item) => item.id === activity.opportunityId) : undefined;
            const contact = activity.contactId ? contactById.get(activity.contactId) : member ? contactById.get(member.contactId) : undefined;
            const campaign = activity.campaignId ? campaignById.get(activity.campaignId) : member ? campaignById.get(member.campaignId) : undefined;
            const account = activity.accountId ? accountById.get(activity.accountId) : undefined;
            const target = opportunity?.title ?? contact?.displayName ?? account?.name ?? campaign?.name ?? "CRM record";
            return <article key={activity.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{labelize(activity.activityType)}</span><Badge>{labelize(activity.direction ?? "internal")}</Badge><span className="text-xs text-fg-3">{labelize(activity.channel)}</span></div><p className="mt-1 text-sm text-fg-2">{activity.summary}</p><p className="mt-1 text-xs text-fg-3">{target} · {personById.get(activity.actorUserId) ?? (activity.actorUserId === props.currentUserId ? "You" : "Inhub user")}{activity.outcome ? ` · ${activity.outcome}` : ""}</p></div>
              <time className="text-xs text-fg-3 sm:text-right" dateTime={activity.occurredAt}>{dateLabel(activity.occurredAt)}</time>
            </article>;
          })}</div> : <Empty>No relationship activity has been recorded yet.</Empty>}
        </Panel>
      </> : null}
    </div>
  );
}

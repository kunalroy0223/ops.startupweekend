"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, Building2, Mail, Phone, Plus, Search } from "lucide-react";
import type { CrmAccount, CrmContact, Role } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";

type WorkspaceOption = { id: string; name: string };
type PersonOption = { uid: string; displayName: string; email: string };
type Editor = { kind: "account"; record?: CrmAccount } | { kind: "contact"; record?: CrmContact } | null;
type ArchiveTarget = { kind: "account" | "contact"; id: string; name: string } | null;
type DncTarget = { contact: CrmContact; clearing: boolean } | null;

const ACCOUNT_TYPES = ["company", "startup", "institution", "investor", "government", "nonprofit", "community", "other"] as const;
const CONTACT_TYPES = ["person", "creator_profile", "brand_profile", "community_profile", "other"] as const;

async function requestJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? data.message ?? `Request failed (${response.status}).`);
  return data as T;
}

function splitTags(value: FormDataEntryValue | null): string[] {
  return [...new Set(String(value ?? "").split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function optional(value: FormDataEntryValue | null): string | undefined {
  const result = String(value ?? "").trim();
  return result || undefined;
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function labelize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "success" }) {
  const className = tone === "danger" ? "border-danger/40 bg-danger/10 text-danger" : tone === "success" ? "border-accent/40 bg-accent-soft text-fg" : "border-line bg-muted text-fg-2";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

export function CrmWorkspace({
  accounts, contacts, workspaces, selectedWorkspaceId, currentUserId, role, people,
}: {
  accounts: CrmAccount[];
  contacts: CrmContact[];
  workspaces: WorkspaceOption[];
  selectedWorkspaceId: string;
  currentUserId: string;
  role: Role;
  people: PersonOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"accounts" | "contacts">("accounts");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget>(null);
  const [dncTarget, setDncTarget] = useState<DncTarget>(null);
  const [dncReason, setDncReason] = useState("");
  const [saving, setSaving] = useState(false);
  const canCreate = role === "admin" || role === "lead";
  const isAdmin = role === "admin";
  const workspaceName = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.name ?? "Workspace";
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const personById = useMemo(() => new Map(people.map((person) => [person.uid, person])), [people]);
  const visibleAccounts = useMemo(() => accounts.filter((account) => [account.name, account.accountType, account.industry, account.city, account.region, account.country, ...account.tags].join(" ").toLowerCase().includes(search.toLowerCase())), [accounts, search]);
  const visibleContacts = useMemo(() => contacts.filter((contact) => [contact.displayName, contact.email, contact.phone, contact.instagramHandleNormalized, contact.category, contact.source, ...contact.tags].join(" ").toLowerCase().includes(search.toLowerCase())), [contacts, search]);

  function changeWorkspace(workspaceId: string) {
    router.push(`/crm?workspaceId=${encodeURIComponent(workspaceId)}`);
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !selectedWorkspaceId) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const tags = splitTags(form.get("tags"));
    try {
      if (editor.kind === "account") {
        const record = editor.record;
        const name = optional(form.get("name"));
        const accountType = String(form.get("accountType") || "company");
        const notes = String(form.get("notes") ?? "").trim();
        const payload = record && role === "member" ? { tags, notes: notes || null } : record ? {
          name, accountType,
          industry: optional(form.get("industry")) ?? null,
          website: optional(form.get("website")) ?? null,
          city: optional(form.get("city")) ?? null,
          region: optional(form.get("region")) ?? null,
          country: optional(form.get("country")) ?? null,
          source: optional(form.get("source")) ?? null,
          tags, notes: notes || null,
          ...(isAdmin && optional(form.get("ownerUserId")) ? { ownerUserId: optional(form.get("ownerUserId")) } : {}),
        } : {
          workspaceId: selectedWorkspaceId, name, accountType,
          industry: optional(form.get("industry")), website: optional(form.get("website")),
          city: optional(form.get("city")), region: optional(form.get("region")), country: optional(form.get("country")),
          source: optional(form.get("source")), tags, notes: optional(form.get("notes")),
          ...(isAdmin && optional(form.get("ownerUserId")) ? { ownerUserId: optional(form.get("ownerUserId")) } : {}),
        };
        if (!record && !name) throw new Error("Enter an account name.");
        if (record) await requestJson(`/api/crm/accounts/${record.id}`, "PATCH", payload);
        else await requestJson("/api/crm/accounts", "POST", payload);
      } else {
        const record = editor.record;
        const displayName = optional(form.get("displayName"));
        const notes = String(form.get("notes") ?? "").trim();
        const payload = record && role === "member" ? { tags, notes: notes || null } : record ? {
          displayName,
          accountId: optional(form.get("accountId")) ?? null,
          email: optional(form.get("email")) ?? null,
          phone: optional(form.get("phone")) ?? null,
          instagramHandle: optional(form.get("instagramHandle")) ?? null,
          instagramProfileUrl: optional(form.get("instagramProfileUrl")) ?? null,
          linkedinProfileUrl: optional(form.get("linkedinProfileUrl")) ?? null,
          category: optional(form.get("category")) ?? null,
          source: optional(form.get("source")) ?? null,
          tags, notes: notes || null,
          ...(isAdmin && optional(form.get("ownerUserId")) ? { ownerUserId: optional(form.get("ownerUserId")) } : {}),
        } : {
          workspaceId: selectedWorkspaceId,
          recordType: String(form.get("recordType") || "person"),
          displayName,
          accountId: optional(form.get("accountId")), email: optional(form.get("email")), phone: optional(form.get("phone")),
          instagramHandle: optional(form.get("instagramHandle")), instagramProfileUrl: optional(form.get("instagramProfileUrl")),
          linkedinProfileUrl: optional(form.get("linkedinProfileUrl")), category: optional(form.get("category")),
          source: optional(form.get("source")), tags, notes: optional(form.get("notes")),
          ...(isAdmin && optional(form.get("ownerUserId")) ? { ownerUserId: optional(form.get("ownerUserId")) } : {}),
        };
        if (!record && !displayName) throw new Error("Enter a contact name.");
        if (record) await requestJson(`/api/crm/contacts/${record.id}`, "PATCH", payload);
        else await requestJson("/api/crm/contacts", "POST", payload);
      }
      toast({ tone: "success", message: editor.record ? "CRM record updated." : "CRM record created." });
      setEditor(null);
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not save this CRM record." });
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      const base = archiveTarget.kind === "account" ? "/api/crm/accounts" : "/api/crm/contacts";
      await requestJson(`${base}/${archiveTarget.id}`, "DELETE");
      toast({ tone: "success", message: `${archiveTarget.name} archived.` });
      setArchiveTarget(null);
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not archive this record." });
    } finally {
      setSaving(false);
    }
  }

  async function updateDoNotContact() {
    if (!dncTarget) return;
    setSaving(true);
    try {
      await requestJson(`/api/crm/contacts/${dncTarget.contact.id}/do-not-contact`, "POST", {
        doNotContact: !dncTarget.clearing,
        ...(dncTarget.clearing ? { reason: dncReason.trim() } : { reason: "operator_requested" }),
      });
      toast({ tone: "success", message: dncTarget.clearing ? "Do-not-contact restriction cleared." : "Contact marked do-not-contact." });
      setDncTarget(null);
      setDncReason("");
      router.refresh();
    } catch (error) {
      toast({ tone: "danger", message: error instanceof Error ? error.message : "Could not update contact preference." });
    } finally {
      setSaving(false);
    }
  }

  if (!workspaces.length) {
    return <div className="grid gap-6"><PageHeader eyebrow="RELATIONSHIP MANAGEMENT" title="CRM" description="Manage Inhub accounts and contacts across your workspace." icon={<Building2 />} /><Panel><SectionHeading title="No active workspace" /><p className="text-sm text-fg-2">An Admin needs to add you to an active workspace before you can use CRM.</p></Panel></div>;
  }

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="RELATIONSHIP MANAGEMENT" title="CRM" description="Keep organisations, people and relationship records organised by workspace. Records are visible according to their owner and your workspace access." icon={<Building2 />} actions={<div className="flex flex-wrap items-center gap-2"><Select aria-label="CRM workspace" value={selectedWorkspaceId} onChange={(event) => changeWorkspace(event.target.value)} className="min-w-44">{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select>{canCreate ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditor({ kind: tab === "accounts" ? "account" : "contact" })}>Add {tab === "accounts" ? "account" : "contact"}</Button> : null}</div>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel><p className="eyebrow">Accounts</p><p className="display mt-2 text-3xl tabular-nums">{accounts.length}</p><p className="mt-1 text-xs text-fg-2">Visible in {workspaceName}</p></Panel>
        <Panel><p className="eyebrow">Contacts</p><p className="display mt-2 text-3xl tabular-nums">{contacts.length}</p><p className="mt-1 text-xs text-fg-2">Visible in {workspaceName}</p></Panel>
        <Panel><p className="eyebrow">Do not contact</p><p className="display mt-2 text-3xl tabular-nums">{contacts.filter((contact) => contact.doNotContact).length}</p><p className="mt-1 text-xs text-fg-2">Contact restrictions in this workspace</p></Panel>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-line bg-muted p-1" role="tablist" aria-label="CRM records">
          <button type="button" role="tab" aria-selected={tab === "accounts"} onClick={() => setTab("accounts")} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === "accounts" ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>Accounts <span className="ml-1 font-mono text-xs">{accounts.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === "contacts"} onClick={() => setTab("contacts")} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === "contacts" ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>Contacts <span className="ml-1 font-mono text-xs">{contacts.length}</span></button>
        </div>
        <label className="relative block w-full sm:max-w-xs"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab}...`} className="pl-9" aria-label={`Search ${tab}`} /></label>
      </div>

      {tab === "accounts" ? (
        <Panel className="overflow-hidden !p-0"><div className="px-5 pt-5"><SectionHeading title="Accounts" count={visibleAccounts.length} /></div>
          {visibleAccounts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-line bg-muted/60 text-[11px] uppercase tracking-wide text-fg-3"><tr><th className="px-5 py-3 font-semibold">Account</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">Location</th><th className="px-4 py-3 font-semibold">Owner</th><th className="px-4 py-3 font-semibold">Updated</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-line">{visibleAccounts.map((account) => <tr key={account.id} className="hover:bg-muted/30"><td className="px-5 py-3.5"><p className="font-semibold">{account.name}</p><p className="mt-0.5 text-xs text-fg-2">{account.industry || account.website || "No industry details"}</p></td><td className="px-4 py-3.5"><StatusPill>{labelize(account.accountType)}</StatusPill></td><td className="px-4 py-3.5 text-fg-2">{[account.city, account.region, account.country].filter(Boolean).join(", ") || "—"}</td><td className="px-4 py-3.5 text-fg-2">{personById.get(account.ownerUserId)?.displayName ?? (account.ownerUserId === currentUserId ? "You" : "Assigned user")}</td><td className="px-4 py-3.5 text-xs text-fg-2">{displayDate(account.updatedAt)}</td><td className="px-5 py-3.5"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEditor({ kind: "account", record: account })}>Open / edit</Button>{isAdmin ? <Button size="sm" variant="ghost" onClick={() => setArchiveTarget({ kind: "account", id: account.id, name: account.name })} aria-label={`Archive ${account.name}`}><Archive className="size-4" /></Button> : null}</div></td></tr>)}</tbody></table></div> : <div className="px-5 pb-6 text-sm text-fg-2">{search ? "No accounts match your search." : "No accounts in this workspace yet."}{canCreate ? " Add an account to start tracking an organisation." : " Accounts assigned to you will appear here."}</div>}
        </Panel>
      ) : (
        <Panel className="overflow-hidden !p-0"><div className="px-5 pt-5"><SectionHeading title="Contacts" count={visibleContacts.length} /></div>
          {visibleContacts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-y border-line bg-muted/60 text-[11px] uppercase tracking-wide text-fg-3"><tr><th className="px-5 py-3 font-semibold">Contact</th><th className="px-4 py-3 font-semibold">Account</th><th className="px-4 py-3 font-semibold">Category</th><th className="px-4 py-3 font-semibold">Owner</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-line">{visibleContacts.map((contact) => <tr key={contact.id} className="hover:bg-muted/30"><td className="px-5 py-3.5"><p className="font-semibold">{contact.displayName}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-2">{contact.email ? <span className="inline-flex items-center gap-1"><Mail className="size-3" />{contact.email}</span> : null}{contact.phone ? <span className="inline-flex items-center gap-1"><Phone className="size-3" />{contact.phone}</span> : null}{contact.instagramHandleNormalized ? <span>@{contact.instagramHandleNormalized}</span> : null}</div></td><td className="px-4 py-3.5 text-fg-2">{contact.accountId ? accountById.get(contact.accountId)?.name ?? "Linked account" : "—"}</td><td className="px-4 py-3.5 text-fg-2">{contact.category || labelize(contact.recordType)}</td><td className="px-4 py-3.5 text-fg-2">{personById.get(contact.ownerUserId)?.displayName ?? (contact.ownerUserId === currentUserId ? "You" : "Assigned user")}</td><td className="px-4 py-3.5">{contact.doNotContact ? <StatusPill tone="danger">Do not contact</StatusPill> : <StatusPill tone="success">Contactable</StatusPill>}</td><td className="px-5 py-3.5"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEditor({ kind: "contact", record: contact })}>Open / edit</Button><Button size="sm" variant="ghost" onClick={() => setDncTarget({ contact, clearing: contact.doNotContact })} disabled={contact.doNotContact && !isAdmin} title={contact.doNotContact && !isAdmin ? "Only Admin can clear this restriction" : undefined}>{contact.doNotContact ? "Restricted" : "Mark DNC"}</Button>{isAdmin ? <Button size="sm" variant="ghost" onClick={() => setArchiveTarget({ kind: "contact", id: contact.id, name: contact.displayName })} aria-label={`Archive ${contact.displayName}`}><Archive className="size-4" /></Button> : null}</div></td></tr>)}</tbody></table></div> : <div className="px-5 pb-6 text-sm text-fg-2">{search ? "No contacts match your search." : "No contacts in this workspace yet."}{canCreate ? " Add a contact to start building your relationship directory." : " Contacts assigned to you will appear here."}</div>}
        </Panel>
      )}

      <Dialog open={!!editor} onClose={() => setEditor(null)} title={`${editor?.record ? "Edit" : "New"} ${editor?.kind === "contact" ? "contact" : "account"}`} description={role === "member" ? "Team Members can update notes and tags on records they own." : `Workspace: ${workspaceName}`} size="lg">
        {editor ? <form key={`${editor.kind}-${editor.record?.id ?? "new"}-${role}`} onSubmit={submitEditor} className="grid gap-4">
          {editor.kind === "account" ? role === "member" && editor.record ? null : <>
            <Field label="Account name" required>{(props) => <Input {...props} name="name" required defaultValue={editor.record?.name ?? ""} maxLength={160} />}</Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Account type" required>{(props) => <Select {...props} name="accountType" defaultValue={editor.record?.accountType ?? "company"}>{ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</Select>}</Field><Field label="Industry">{(props) => <Input {...props} name="industry" defaultValue={editor.record?.industry ?? ""} maxLength={100} />}</Field><Field label="Website">{(props) => <Input {...props} name="website" type="url" placeholder="https://" defaultValue={editor.record?.website ?? ""} />}</Field><Field label="Source">{(props) => <Input {...props} name="source" defaultValue={editor.record?.source ?? ""} maxLength={100} />}</Field><Field label="City">{(props) => <Input {...props} name="city" defaultValue={editor.record?.city ?? ""} maxLength={100} />}</Field><Field label="Region / State">{(props) => <Input {...props} name="region" defaultValue={editor.record?.region ?? ""} maxLength={100} />}</Field><Field label="Country">{(props) => <Input {...props} name="country" defaultValue={editor.record?.country ?? ""} maxLength={100} />}</Field>{isAdmin ? <Field label="Owner">{(props) => <Select {...props} name="ownerUserId" defaultValue={editor.record?.ownerUserId ?? currentUserId}><option value="">Default (you)</option>{people.map((person) => <option key={person.uid} value={person.uid}>{person.displayName} · {person.email}</option>)}</Select>}</Field> : null}</div>
          </> : editor.record ? <Field label="Contact name" required>{(props) => <Input {...props} name="displayName" required defaultValue={editor.record?.displayName ?? ""} maxLength={160} />}</Field> : <div className="grid gap-4 sm:grid-cols-2"><Field label="Contact name" required>{(props) => <Input {...props} name="displayName" required maxLength={160} />}</Field><Field label="Record type" required>{(props) => <Select {...props} name="recordType" defaultValue="person">{CONTACT_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</Select>}</Field></div>}
          {editor.kind === "contact" && !(role === "member" && editor.record) ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Linked account">{(props) => <Select {...props} name="accountId" defaultValue={editor.record?.accountId ?? ""}><option value="">No linked account</option>{editor.record?.accountId && !accountById.has(editor.record.accountId) ? <option value={editor.record.accountId}>Currently linked account</option> : null}{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select>}</Field><Field label="Category">{(props) => <Input {...props} name="category" defaultValue={editor.record?.category ?? ""} maxLength={100} />}</Field><Field label="Email">{(props) => <Input {...props} name="email" type="email" defaultValue={editor.record?.email ?? ""} />}</Field><Field label="Phone">{(props) => <Input {...props} name="phone" type="tel" defaultValue={editor.record?.phone ?? ""} maxLength={40} />}</Field><Field label="Instagram handle">{(props) => <Input {...props} name="instagramHandle" placeholder="@username" defaultValue={editor.record?.instagramHandleNormalized ?? ""} />}</Field><Field label="Instagram profile URL">{(props) => <Input {...props} name="instagramProfileUrl" type="url" placeholder="https://" defaultValue={editor.record?.instagramProfileUrl ?? ""} />}</Field><Field label="LinkedIn profile URL">{(props) => <Input {...props} name="linkedinProfileUrl" type="url" placeholder="https://" defaultValue={editor.record?.linkedinProfileUrl ?? ""} />}</Field><Field label="Source">{(props) => <Input {...props} name="source" defaultValue={editor.record?.source ?? ""} maxLength={100} />}</Field>{isAdmin ? <Field label="Owner">{(props) => <Select {...props} name="ownerUserId" defaultValue={editor.record?.ownerUserId ?? currentUserId}><option value="">Default (you)</option>{people.map((person) => <option key={person.uid} value={person.uid}>{person.displayName} · {person.email}</option>)}</Select>}</Field> : null}</div> : null}
          <Field label="Tags" hint="Separate tags with commas.">{(props) => <Input {...props} name="tags" defaultValue={editor.record?.tags.join(", ") ?? ""} maxLength={1200} />}</Field>
          <Field label="Notes">{(props) => <Textarea {...props} name="notes" defaultValue={editor.record?.notes ?? ""} maxLength={5000} />}</Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="ghost" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" variant="primary" loading={saving}>{editor.record ? "Save changes" : "Create record"}</Button></div>
        </form> : null}
      </Dialog>

      <ConfirmDialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} onConfirm={confirmArchive} title="Archive CRM record" consequence={<>Archive <strong>{archiveTarget?.name}</strong>? It will no longer appear in active CRM lists.</>} confirmLabel="Archive record" tone="danger" loading={saving} />
      <Dialog open={!!dncTarget} onClose={() => { setDncTarget(null); setDncReason(""); }} title={dncTarget?.clearing ? "Clear do-not-contact restriction" : "Mark contact as do-not-contact"} description={dncTarget?.contact.displayName} size="sm" footer={<><Button variant="ghost" onClick={() => setDncTarget(null)}>Cancel</Button><Button variant={dncTarget?.clearing ? "primary" : "danger"} loading={saving} disabled={!!dncTarget?.clearing && dncReason.trim().length < 3} onClick={updateDoNotContact}>{dncTarget?.clearing ? "Clear restriction" : "Mark do not contact"}</Button></>}>
        {dncTarget?.clearing ? <Field label="Reason for clearing" required hint="At least 3 characters.">{(props) => <Textarea {...props} value={dncReason} onChange={(event) => setDncReason(event.target.value)} placeholder="Explain why this restriction is being cleared." />}</Field> : <p className="text-sm text-fg-2">This prevents the contact from being treated as available for outreach. The restriction is recorded in the contact history.</p>}
      </Dialog>
    </div>
  );
}

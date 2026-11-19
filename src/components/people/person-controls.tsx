"use client";
import { ArrowRightLeft, Ban, CirclePause, Pencil, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, ArchivedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/states";
import { useToast, FormError } from "@/components/ui/toast";
import { allowedStatusTransitions } from "@/domain/authz";
import { ROLE_LABEL, ROLES, type Role, type UserStatus } from "@/domain/types";
import { api, ApiClientError } from "@/lib/api";
import { formatDate } from "@/lib/format";

function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function run(fn: () => Promise<unknown>, success: string, after?: () => void) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await fn();
      toast({ tone: "success", message: success });
      after?.();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, fields, run, clear: () => { setError(null); setFields({}); } };
}

export function EditProfileButton({ uid, self, displayName, title }: { uid: string; self: boolean; displayName: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [t, setT] = useState(title ?? "");
  const a = useAction();
  const close = () => { setOpen(false); a.clear(); };
  return (
    <>
      <Button icon={<Pencil className="size-4" />} onClick={() => setOpen(true)}>Edit details</Button>
      <Dialog
        open={open}
        onClose={close}
        title={self ? "Edit your details" : "Edit details"}
        description={self ? "Email, role and team assignments are managed by an Admin." : "Email is fixed to the sign-in account."}
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={a.busy} onClick={() => a.run(() => api(self ? "/api/me" : `/api/users/${uid}`, { method: "PATCH", body: { displayName: name, title: t } }), "Details saved.", close)}>Save</Button></>}
      >
        <div className="grid gap-4">
          <Field label="Display name" error={a.fields.displayName}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Title" hint="Optional, e.g. Operations Coordinator." error={a.fields.title}>{(p) => <Input {...p} value={t} onChange={(e) => setT(e.target.value)} />}</Field>
          {a.error && !Object.keys(a.fields).length ? <InlineAlert tone="danger">{a.error}</InlineAlert> : null}
        </div>
      </Dialog>
    </>
  );
}

export function RoleControl({ uid, name, role }: { uid: string; name: string; role: Role }) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<Role>(role);
  const [reason, setReason] = useState("");
  const a = useAction();
  const close = () => { setOpen(false); setNext(role); setReason(""); a.clear(); };
  const demoting = role === "lead" && next === "member";
  return (
    <>
      <Button icon={<ShieldCheck className="size-4" />} onClick={() => setOpen(true)}>Change role</Button>
      <ConfirmDialog
        open={open}
        onClose={close}
        onConfirm={() => a.run(() => api(`/api/users/${uid}/role`, { body: { role: next, reason: reason || undefined } }), `${name} is now ${ROLE_LABEL[next]}.`, close)}
        loading={a.busy}
        error={a.error}
        title={`Change ${name}'s role`}
        confirmLabel={next === role ? "Choose a new role" : `Make ${ROLE_LABEL[next]}`}
        consequence={<>The change applies on their next request and is recorded in the activity log. {name} will be notified.</>}
      >
        <Field label="New role">{(p) => <Select {...p} value={next} onChange={(e) => setNext(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}{r === role ? " (current)" : ""}</option>)}</Select>}</Field>
        {next === "admin" && role !== "admin" ? <InlineAlert tone="warning">Admins have unrestricted access to every person, team and setting.</InlineAlert> : null}
        {demoting ? <InlineAlert tone="info">Their Lead assignments become regular memberships.</InlineAlert> : null}
        <Field label="Reason" hint="Optional. Saved in the activity log.">{(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </ConfirmDialog>
    </>
  );
}

const STATUS_COPY: Record<UserStatus, { label: string; icon: React.ReactNode; consequence: string; tone: "primary" | "danger" }> = {
  active: { label: "Reactivate", icon: <Play className="size-4" />, consequence: "They can sign in again with their existing password. Their history is unchanged.", tone: "primary" },
  suspended: { label: "Suspend", icon: <CirclePause className="size-4" />, consequence: "They're signed out everywhere and can't sign in until reactivated. Assignments and history stay as they are.", tone: "danger" },
  deactivated: { label: "Deactivate", icon: <Ban className="size-4" />, consequence: "Access is revoked and they're signed out everywhere. Their tasks, reports and audit history are kept. You can reactivate later.", tone: "danger" },
  invited: { label: "", icon: null, consequence: "", tone: "primary" },
};

export function StatusControls({ uid, name, status }: { uid: string; name: string; status: UserStatus }) {
  const [target, setTarget] = useState<UserStatus | null>(null);
  const [reason, setReason] = useState("");
  const a = useAction();
  const close = () => { setTarget(null); setReason(""); a.clear(); };
  return (
    <>
      {allowedStatusTransitions(status).map((s) => (
        <Button key={s} variant={s === "active" ? "secondary" : "ghost"} className={s !== "active" ? "text-danger hover:!text-danger" : undefined} icon={STATUS_COPY[s].icon} onClick={() => setTarget(s)}>
          {STATUS_COPY[s].label}
        </Button>
      ))}
      <ConfirmDialog
        open={!!target}
        onClose={close}
        onConfirm={() => target && a.run(() => api(`/api/users/${uid}/status`, { body: { status: target, reason: reason || undefined } }), `${name}: ${STATUS_COPY[target].label.toLowerCase()}d.`, close)}
        loading={a.busy}
        error={a.error}
        tone={target ? STATUS_COPY[target].tone : "primary"}
        title={target ? `${STATUS_COPY[target].label} ${name}?` : ""}
        confirmLabel={target ? STATUS_COPY[target].label : ""}
        consequence={target ? STATUS_COPY[target].consequence : ""}
      >
        <Field label="Reason" hint="Optional. Saved in the activity log.">{(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </ConfirmDialog>
    </>
  );
}

export interface MembershipView {
  id: string;
  scopeKind: "team" | "workstream";
  scopeId: string;
  scopeName: string;
  scopeStatus: "active" | "archived";
  membershipType: "lead" | "member";
  status: "active" | "inactive";
  assignedAt: string;
  endedAt?: string;
}

export function MembershipManager({ uid, name, role, memberships, teams, workstreams, canManage, tz }: { uid: string; name: string; role: Role; memberships: MembershipView[]; teams: { id: string; name: string }[]; workstreams: { id: string; name: string }[]; canManage: boolean; tz?: string }) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"team" | "workstream">("team");
  const [scopeId, setScopeId] = useState("");
  const [type, setType] = useState<"member" | "lead">(role === "member" ? "member" : "lead");
  const [removing, setRemoving] = useState<MembershipView | null>(null);
  const [moving, setMoving] = useState<MembershipView | null>(null);
  const [toTeam, setToTeam] = useState("");
  const a = useAction();
  const active = memberships.filter((m) => m.status === "active");
  const past = memberships.filter((m) => m.status === "inactive");
  const taken = new Set(active.map((m) => m.scopeId));
  const options = (kind === "team" ? teams : workstreams).filter((o) => !taken.has(o.id));
  const closeAdd = () => { setAdding(false); setScopeId(""); a.clear(); };

  const row = (m: MembershipView) => (
    <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <a href={`/structure/${m.scopeKind === "team" ? "teams" : "workstreams"}/${m.scopeId}`} className="font-semibold hover:underline">{m.scopeName}</a>
        <span className="ml-2 text-xs text-fg-2 capitalize">{m.scopeKind}</span>
        <span className="block font-mono text-[11px] text-fg-3">{m.status === "active" ? `since ${formatDate(m.assignedAt, tz)}` : `${formatDate(m.assignedAt, tz)} – ${formatDate(m.endedAt, tz)}`}</span>
      </span>
      {m.scopeStatus === "archived" ? <ArchivedBadge /> : null}
      <Badge tone={m.membershipType === "lead" ? "accent" : "slate"}>{m.membershipType === "lead" ? "Lead" : "Member"}</Badge>
      {canManage && m.status === "active" ? (
        <span className="flex gap-1">
          {m.scopeKind === "team" ? <Button size="sm" variant="ghost" icon={<ArrowRightLeft className="size-3.5" />} onClick={() => { setMoving(m); setToTeam(""); }}>Move</Button> : null}
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setRemoving(m)} aria-label={`Remove from ${m.scopeName}`}>Remove</Button>
        </span>
      ) : null}
    </li>
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold">Teams & workstreams <span className="font-mono text-xs font-medium text-fg-3">{active.length}</span></h2>
        {canManage ? <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Assign</Button> : null}
      </div>
      {active.length ? <ul className="divide-y divide-line">{active.map(row)}</ul> : <p className="text-[13px] text-fg-2">{name} isn&apos;t assigned to any team or workstream.</p>}
      {past.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-fg-2">Past assignments ({past.length})</summary>
          <ul className="divide-y divide-line opacity-80">{past.map(row)}</ul>
        </details>
      ) : null}

      <Dialog
        open={adding}
        onClose={closeAdd}
        title={`Assign ${name}`}
        footer={<><Button variant="ghost" onClick={closeAdd}>Cancel</Button><Button variant="primary" loading={a.busy} disabled={!scopeId} onClick={() => a.run(() => api(`/api/users/${uid}/memberships`, { body: { scopeKind: kind, scopeId, membershipType: type } }), "Assignment saved.", closeAdd)}>Assign</Button></>}
      >
        <div className="grid gap-4">
          <Field label="Assign to">{(p) => <Select {...p} value={kind} onChange={(e) => { setKind(e.target.value as "team"); setScopeId(""); }}><option value="team">A team</option><option value="workstream">A workstream</option></Select>}</Field>
          <Field label={kind === "team" ? "Team" : "Workstream"} error={a.fields.scopeId}>{(p) => <Select {...p} value={scopeId} onChange={(e) => setScopeId(e.target.value)}><option value="">Choose…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}</Field>
          <Field label="As" hint={role === "member" ? "Only Leads and Admins can be assigned as a Lead." : undefined}>{(p) => <Select {...p} value={type} onChange={(e) => setType(e.target.value as "lead")}><option value="member">Member</option><option value="lead" disabled={role === "member"}>Lead</option></Select>}</Field>
          <FormError message={a.error} />
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onClose={() => { setRemoving(null); a.clear(); }}
        onConfirm={() => removing && a.run(() => api(`/api/users/${uid}/memberships?scopeKind=${removing.scopeKind}&scopeId=${removing.scopeId}`, { method: "DELETE" }), "Removed.", () => setRemoving(null))}
        loading={a.busy}
        error={a.error}
        tone="danger"
        title={`Remove from ${removing?.scopeName ?? ""}?`}
        confirmLabel="Remove"
        consequence={<>{name} loses access to this {removing?.scopeKind}&apos;s private resources. The assignment stays in their history.</>}
      />

      <ConfirmDialog
        open={!!moving}
        onClose={() => { setMoving(null); a.clear(); }}
        onConfirm={() => moving && toTeam && a.run(() => api(`/api/users/${uid}/transfer`, { body: { fromTeamId: moving.scopeId, toTeamId: toTeam } }), "Moved.", () => setMoving(null))}
        loading={a.busy}
        error={a.error}
        title={`Move ${name} to another team`}
        confirmLabel="Move"
        consequence={<>They leave <strong className="text-fg">{moving?.scopeName}</strong> and join the new team as {moving?.membershipType === "lead" ? "a Lead" : "a member"}, in one step.</>}
      >
        <Field label="Destination team">{(p) => <Select {...p} value={toTeam} onChange={(e) => setToTeam(e.target.value)}><option value="">Choose…</option>{teams.filter((t) => !taken.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}</Field>
      </ConfirmDialog>
    </div>
  );
}

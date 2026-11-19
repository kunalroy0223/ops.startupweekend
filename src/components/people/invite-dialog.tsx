"use client";
import { Check, Copy, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormError } from "@/components/ui/toast";
import { InlineAlert } from "@/components/ui/states";
import { api, ApiClientError } from "@/lib/api";

export interface ScopeOption {
  id: string;
  name: string;
  workspaceId: string;
}

export function InviteButton({ workspaces, workstreams, teams, emailReady }: { workspaces: { id: string; name: string }[]; workstreams: ScopeOption[]; teams: ScopeOption[]; emailReady: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [manual, setOpen] = useState(false);
  // ?invite=1 (from the overview's quick actions) opens the dialog directly.
  const open = manual || params.get("invite") === "1";
  const close = () => {
    setOpen(false);
    if (params.get("invite")) router.replace("/people");
  };
  return (
    <>
      <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>
        Invite person
      </Button>
      <InviteDialog open={open} onClose={close} workspaces={workspaces} workstreams={workstreams} teams={teams} emailReady={emailReady} />
    </>
  );
}

function InviteDialog({ open, onClose, workspaces, workstreams, teams, emailReady }: { open: boolean; onClose: () => void; workspaces: { id: string; name: string }[]; workstreams: ScopeOption[]; teams: ScopeOption[]; emailReady: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "lead">("member");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [streamIds, setStreamIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inviteUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const wsStreams = useMemo(() => workstreams.filter((w) => w.workspaceId === workspaceId), [workstreams, workspaceId]);
  const wsTeams = useMemo(() => teams.filter((t) => t.workspaceId === workspaceId), [teams, workspaceId]);
  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...list, id] : list.filter((x) => x !== id));

  function reset() {
    setEmail("");
    setRole("member");
    setStreamIds([]);
    setTeamIds([]);
    setFields({});
    setError(null);
    setResult(null);
    setCopied(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const r = await api<{ inviteUrl: string }>("/api/invitations", { body: { email, intendedRole: role, workspaceId, workstreamIds: streamIds, teamIds } });
      setResult(r);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFields(err.fields);
        setError(err.message);
      } else setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const closeAll = () => {
    reset();
    onClose();
  };

  if (result) {
    return (
      <Dialog open={open} onClose={closeAll} title="Invitation created" footer={<Button variant="primary" onClick={closeAll}>Done</Button>}>
        <div className="grid gap-4">
          <InlineAlert tone={emailReady ? "success" : "warning"} title={emailReady ? `An email is on its way to ${email}` : "Email delivery isn't configured"}>
            {emailReady ? "You can also share the link below directly." : "Resend isn't set up yet, so no email was sent. Share this single-use link with the person yourself."}
          </InlineAlert>
          <Field label="Invitation link" hint="Works once, only for this email address. Treat it like a password.">
            {(p) => (
              <div className="flex gap-2">
                <Input {...p} readOnly value={result.inviteUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.inviteUrl).catch(() => undefined);
                    setCopied(true);
                  }}
                  icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
          </Field>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={closeAll}
      title="Invite a person"
      description="They'll choose their own name and password from a single-use link."
      footer={
        <>
          <Button variant="ghost" onClick={closeAll} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form="invite-form" loading={busy} disabled={!email || !workspaceId}>Send invitation</Button>
        </>
      }
    >
      {!workspaces.length ? (
        <InlineAlert tone="warning">Create a workspace before inviting people.</InlineAlert>
      ) : (
        <form id="invite-form" onSubmit={submit} className="grid gap-5" noValidate>
          <Field label="Email" required error={fields.email}>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@inspiria.edu.in" autoFocus />}</Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-[13px] font-semibold">Role</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([["member", "Team Member", "Works on assigned tasks and submits daily reports."], ["lead", "Lead", "Leads assigned teams and reviews their reports."]] as const).map(([v, l, d]) => (
                <label key={v} className={`cursor-pointer rounded-[var(--radius-control)] border-[1.5px] p-3 ${role === v ? "border-line-strong bg-accent-soft shadow-hard-sm" : "border-line hover:border-fg-3"}`}>
                  <input type="radio" name="role" value={v} checked={role === v} onChange={() => setRole(v)} className="sr-only" />
                  <span className="block text-sm font-semibold">{l}</span>
                  <span className="mt-0.5 block text-xs text-fg-2">{d}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-fg-3">Admins can&apos;t be invited directly. Promote an active person instead.</p>
          </fieldset>
          {workspaces.length > 1 ? (
            <Field label="Workspace" error={fields.workspaceId}>{(p) => <Select {...p} value={workspaceId} onChange={(e) => { setWorkspaceId(e.target.value); setStreamIds([]); setTeamIds([]); }}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}</Field>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">Teams</legend>
              <div className="max-h-40 overflow-y-auto rounded-[var(--radius-control)] border border-line p-1">
                {wsTeams.length ? wsTeams.map((t) => <Checkbox key={t.id} label={t.name} checked={teamIds.includes(t.id)} onChange={(v) => toggle(teamIds, setTeamIds, t.id, v)} />) : <p className="p-2 text-xs text-fg-3">No active teams yet.</p>}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">Workstreams</legend>
              <div className="max-h-40 overflow-y-auto rounded-[var(--radius-control)] border border-line p-1">
                {wsStreams.length ? wsStreams.map((t) => <Checkbox key={t.id} label={t.name} checked={streamIds.includes(t.id)} onChange={(v) => toggle(streamIds, setStreamIds, t.id, v)} />) : <p className="p-2 text-xs text-fg-3">No active workstreams yet.</p>}
              </div>
            </fieldset>
          </div>
          <p className="text-xs text-fg-2">{role === "lead" ? "They'll join the selected teams and workstreams as a Lead." : "They'll join the selected teams and workstreams as a member."}</p>
          <FormError message={error && !Object.keys(fields).length ? error : null} />
        </form>
      )}
    </Dialog>
  );
}

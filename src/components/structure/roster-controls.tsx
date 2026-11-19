"use client";
import { Link2, Link2Off, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { useToast, FormError } from "@/components/ui/toast";
import { ROLE_LABEL, type Role } from "@/domain/types";
import { api, ApiClientError } from "@/lib/api";

type Person = { uid: string; displayName: string; email: string; role: Role };

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    busy,
    error,
    reset: () => setError(null),
    async run(fn: () => Promise<unknown>, msg: string, after?: () => void) {
      setBusy(true);
      setError(null);
      try {
        await fn();
        toast({ tone: "success", message: msg });
        after?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
  };
}

export function AddPeopleButton({ scopeKind, scopeId, scopeName, people, existing }: { scopeKind: "team" | "workstream"; scopeId: string; scopeName: string; people: Person[]; existing: string[] }) {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState("");
  const [type, setType] = useState<"member" | "lead">("member");
  const r = useRun();
  const options = useMemo(() => people.filter((p) => !existing.includes(p.uid)), [people, existing]);
  const chosen = people.find((p) => p.uid === uid);
  const close = () => { setOpen(false); setUid(""); setType("member"); r.reset(); };
  return (
    <>
      <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>Add people</Button>
      <Dialog
        open={open}
        onClose={close}
        title={`Add to ${scopeName}`}
        description="People are notified when they're added. Leads of this team are told too."
        footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={r.busy} disabled={!uid} onClick={() => r.run(() => api(`/api/users/${uid}/memberships`, { body: { scopeKind, scopeId, membershipType: type } }), `${chosen?.displayName} added.`, close)}>Add</Button></>}
      >
        <div className="grid gap-4">
          <Field label="Person" hint={options.length ? undefined : "Everyone is already here, or no one has accepted an invitation yet."}>
            {(p) => (
              <Select {...p} value={uid} onChange={(e) => { setUid(e.target.value); const role = people.find((x) => x.uid === e.target.value)?.role; if (role === "member") setType("member"); }}>
                <option value="">Choose a person…</option>
                {options.map((o) => <option key={o.uid} value={o.uid}>{o.displayName} · {ROLE_LABEL[o.role]} · {o.email}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Add as" hint={chosen?.role === "member" ? "Team Members can't be Leads. Change their role on their profile first." : "Leads see the whole team and will review its work."}>
            {(p) => <Select {...p} value={type} onChange={(e) => setType(e.target.value as "lead")}><option value="member">Member</option><option value="lead" disabled={chosen?.role === "member"}>Lead</option></Select>}
          </Field>
          <FormError message={r.error} />
        </div>
      </Dialog>
    </>
  );
}

export function RemoveFromScope({ scopeKind, scopeId, scopeName, uid, name }: { scopeKind: "team" | "workstream"; scopeId: string; scopeName: string; uid: string; name: string }) {
  const [open, setOpen] = useState(false);
  const r = useRun();
  return (
    <>
      <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setOpen(true)} aria-label={`Remove ${name}`}>Remove</Button>
      <ConfirmDialog
        open={open}
        onClose={() => { setOpen(false); r.reset(); }}
        onConfirm={() => r.run(() => api(`/api/users/${uid}/memberships?scopeKind=${scopeKind}&scopeId=${scopeId}`, { method: "DELETE" }), `${name} removed.`, () => setOpen(false))}
        loading={r.busy}
        error={r.error}
        tone="danger"
        title={`Remove ${name} from ${scopeName}?`}
        confirmLabel="Remove"
        consequence="They lose access to this group's private work. Their past membership stays on record."
      />
    </>
  );
}

export function TeamLinks({ teamId, linked, available }: { teamId: string; linked: { id: string; name: string }[]; available: { id: string; name: string }[] }) {
  const [adding, setAdding] = useState("");
  const r = useRun();
  const options = available.filter((a) => !linked.some((l) => l.id === a.id));
  return (
    <div className="grid gap-3">
      {linked.length ? (
        <ul className="divide-y divide-line">
          {linked.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2">
              <a href={`/structure/workstreams/${l.id}`} className="text-[13px] font-semibold hover:underline">{l.name}</a>
              <Button size="sm" variant="ghost" icon={<Link2Off className="size-3.5" />} loading={r.busy} onClick={() => r.run(() => api(`/api/teams/${teamId}/links`, { body: { workstreamId: l.id, linked: false } }), `Unlinked from ${l.name}.`)}>Unlink</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-2">Not linked to a workstream yet.</p>
      )}
      {options.length ? (
        <div className="flex gap-2">
          <label htmlFor="link-ws" className="sr-only">Workstream to link</label>
          <Select id="link-ws" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Link a workstream…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Button icon={<Link2 className="size-4" />} disabled={!adding} loading={r.busy} onClick={() => r.run(() => api(`/api/teams/${teamId}/links`, { body: { workstreamId: adding, linked: true } }), "Linked.", () => setAdding(""))}>Link</Button>
        </div>
      ) : null}
      <FormError message={r.error} />
    </div>
  );
}

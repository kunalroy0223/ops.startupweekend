"use client";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/states";
import { FormError, useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/api";

type Kind = "workspaces" | "workstreams" | "teams";
const NOUN: Record<Kind, string> = { workspaces: "workspace", workstreams: "workstream", teams: "team" };
const HELP: Record<Kind, string> = {
  workspaces: "The top-level area everything lives in. Most organisations need just one.",
  workstreams: "A long-running area of work, like Partnerships, Operations or Marketing.",
  teams: "A group of people who do the work together. Link it to the workstreams it serves.",
};

/** Create or edit a workspace, workstream or team. Opens itself when ?new=<noun> is in the URL. */
export function ResourceFormButton({
  kind,
  existing,
  workspaces = [],
  workstreams = [],
  label,
  variant = "primary",
  listenToUrl = false,
}: {
  kind: Kind;
  existing?: { id: string; name: string; description?: string };
  workspaces?: { id: string; name: string }[];
  workstreams?: { id: string; name: string; workspaceId: string }[];
  label?: string;
  variant?: "primary" | "secondary";
  /** Only one button per page should open from ?new=<noun>. */
  listenToUrl?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [manual, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const noun = NOUN[kind];

  // ?new=<noun> (from the overview's setup steps) opens the create dialog directly.
  const open = manual || (listenToUrl && !existing && params.get("new") === noun);

  const close = () => {
    setOpen(false);
    setError(null);
    setFields({});
    if (!existing) {
      setName("");
      setDescription("");
      setLinks([]);
    }
    if (params.get("new")) router.replace(window.location.pathname);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (existing) {
        await api(`/api/structure/${kind}/${existing.id}`, { method: "PATCH", body: { name, description } });
        toast({ tone: "success", message: `Saved ${name}.` });
        close();
        router.refresh();
      } else {
        const body = kind === "workspaces" ? { name, description } : kind === "workstreams" ? { name, description, workspaceId } : { name, description, workspaceId, workstreamIds: links };
        const r = await api<{ id: string }>(`/api/structure/${kind}`, { body });
        toast({ tone: "success", message: `Created ${name}.` });
        close();
        router.push(kind === "workspaces" ? "/workspaces" : `/structure/${kind}/${r.id}`);
        router.refresh();
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={existing ? "secondary" : variant} icon={existing ? <Pencil className="size-4" /> : <Plus className="size-4" />} onClick={() => setOpen(true)}>
        {label ?? (existing ? "Edit" : `New ${noun}`)}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={existing ? `Edit ${noun}` : `New ${noun}`}
        description={HELP[kind]}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
            <Button variant="primary" type="submit" form={`form-${kind}`} loading={busy} disabled={name.trim().length < 2 || (kind !== "workspaces" && !existing && !workspaceId)}>
              {existing ? "Save" : `Create ${noun}`}
            </Button>
          </>
        }
      >
        <form id={`form-${kind}`} onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Name" required error={fields.name}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />}</Field>
          <Field label="Description" hint="Optional. One or two sentences on what it's for." error={fields.description}>{(p) => <Textarea {...p} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
          {!existing && kind !== "workspaces" && workspaces.length > 1 ? (
            <Field label="Workspace" error={fields.workspaceId}>{(p) => <Select {...p} value={workspaceId} onChange={(e) => { setWorkspaceId(e.target.value); setLinks([]); }}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}</Field>
          ) : null}
          {!existing && kind !== "workspaces" && !workspaces.length ? <InlineAlert tone="warning">Create a workspace first.</InlineAlert> : null}
          {!existing && kind === "teams" ? (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">Workstreams this team serves</legend>
              <div className="max-h-44 overflow-y-auto rounded-[var(--radius-control)] border border-line p-1">
                {workstreams.filter((w) => w.workspaceId === workspaceId).length ? (
                  workstreams.filter((w) => w.workspaceId === workspaceId).map((w) => <Checkbox key={w.id} label={w.name} checked={links.includes(w.id)} onChange={(v) => setLinks(v ? [...links, w.id] : links.filter((x) => x !== w.id))} />)
                ) : (
                  <p className="p-2 text-xs text-fg-3">No workstreams yet. You can link one later.</p>
                )}
              </div>
            </fieldset>
          ) : null}
          <FormError message={error && !Object.keys(fields).length ? error : null} />
        </form>
      </Dialog>
    </>
  );
}

export function ArchiveButton({ kind, id, name, archived }: { kind: Kind; id: string; name: string; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = NOUN[kind];
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/structure/${kind}/${id}/archive`, { body: { archived: !archived } });
      toast({ tone: "success", message: archived ? `${name} restored.` : `${name} archived.` });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="ghost" icon={archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={() => setOpen(true)}>
        {archived ? "Restore" : "Archive"}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={go}
        loading={busy}
        error={error}
        tone={archived ? "primary" : "danger"}
        title={archived ? `Restore ${name}?` : `Archive ${name}?`}
        confirmLabel={archived ? "Restore" : "Archive"}
        consequence={archived ? `The ${noun} becomes active again and people can be assigned to it.` : `Nothing is deleted. The ${noun}, its members and its history are kept and can be restored. No one new can be assigned while it's archived.`}
      />
    </>
  );
}

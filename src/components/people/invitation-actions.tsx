"use client";
import { Copy, MoreHorizontal, RotateCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/api";

export function InvitationActions({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | "revoke" | "resend">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "resend" | "revoke" | "link") {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ inviteUrl?: string }>(`/api/invitations/${id}/${action}`, { method: "POST" });
      if (r.inviteUrl) await navigator.clipboard.writeText(r.inviteUrl).catch(() => undefined);
      toast({ tone: "success", message: action === "revoke" ? `Invitation for ${email} revoked.` : action === "resend" ? "New link created and copied. Earlier links no longer work." : "Invitation link copied." });
      setConfirm(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Something went wrong.";
      if (confirm) setError(msg);
      else toast({ tone: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Menu label={`Actions for invitation to ${email}`} trigger={<span className="grid size-8 place-items-center rounded-md text-fg-2 hover:bg-muted"><MoreHorizontal className="size-4" /></span>}>
        {(close) => (
          <>
            <MenuItem icon={<Copy />} onSelect={() => { close(); void run("link"); }}>Copy invitation link</MenuItem>
            <MenuItem icon={<RotateCw />} onSelect={() => { close(); setConfirm("resend"); }}>Resend with a new link</MenuItem>
            <MenuItem icon={<XCircle />} tone="danger" onSelect={() => { close(); setConfirm("revoke"); }}>Revoke invitation</MenuItem>
          </>
        )}
      </Menu>
      <ConfirmDialog
        open={confirm === "resend"}
        onClose={() => setConfirm(null)}
        onConfirm={() => run("resend")}
        loading={busy}
        error={error}
        title="Resend invitation?"
        consequence={<>A new link goes to <strong className="text-fg">{email}</strong> and the expiry resets. Any earlier link stops working immediately.</>}
        confirmLabel="Resend"
      />
      <ConfirmDialog
        open={confirm === "revoke"}
        onClose={() => setConfirm(null)}
        onConfirm={() => run("revoke")}
        loading={busy}
        error={error}
        tone="danger"
        title="Revoke invitation?"
        consequence={<>The link for <strong className="text-fg">{email}</strong> stops working. The record stays in the activity log. You can invite them again later.</>}
        confirmLabel="Revoke"
      />
    </>
  );
}

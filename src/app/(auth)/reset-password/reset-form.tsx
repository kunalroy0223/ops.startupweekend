"use client";
import Link from "next/link";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseMessage } from "@/components/auth/firebase-errors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineAlert, Skeleton } from "@/components/ui/states";
import { passwordSchema } from "@/domain/validation";
import { clientAuth } from "@/lib/firebase-client";
import { FormError, useToast } from "@/components/ui/toast";

export function ResetForm({ oobCode }: { oobCode: string }) {
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    clientAuth()
      .then((auth) => verifyPasswordResetCode(auth, oobCode))
      .then((e) => {
        setEmail(e);
        setState("ready");
      })
      .catch((err) => {
        setError(firebaseMessage(err));
        setState("invalid");
      });
  }, [oobCode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(await clientAuth(), oobCode, password);
      setState("done");
      toast({ tone: "success", title: "Password updated", message: "Sign in with your new password." });
    } catch (err) {
      setError(firebaseMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return <div className="grid gap-3" role="status" aria-label="Checking link"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
  if (state === "invalid")
    return (
      <div className="grid gap-4">
        <FormError message={error} />
        <Link href="/forgot-password" className="text-[13px] font-semibold underline underline-offset-4">Request a new link</Link>
      </div>
    );
  if (state === "done")
    return (
      <div className="grid gap-4">
        <InlineAlert tone="success" title="Password updated">Sign in with your new password.</InlineAlert>
        <Link href="/login" className="text-[13px] font-semibold underline underline-offset-4">Go to sign in</Link>
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <p className="text-[13px] text-fg-2">For <span className="font-semibold text-fg">{email}</span></p>
      <Field label="New password" hint="At least 10 characters, with a letter and a number.">{(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
      <Field label="Confirm new password">{(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" loading={busy} className="w-full">Save new password</Button>
    </form>
  );
}

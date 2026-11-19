"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { firebaseMessage } from "@/components/auth/firebase-errors";
import { signInAndCreateSession } from "@/components/auth/sign-in";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { passwordSchema } from "@/domain/validation";
import { api, ApiClientError } from "@/lib/api";
import { FormError } from "@/components/ui/toast";

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [displayName, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const f: Record<string, string> = {};
    if (displayName.trim().length < 2) f.displayName = "Enter your name";
    const p = passwordSchema.safeParse(password);
    if (!p.success) f.password = p.error.issues[0]!.message;
    if (password !== confirm) f.confirm = "The passwords don't match";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      await api("/api/invitations/accept", { body: { token, displayName: displayName.trim(), password } });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiClientError) {
        setFields(err.fields);
        setError(err.message);
      } else setError("Something went wrong. Try again.");
      return;
    }
    try {
      await signInAndCreateSession(email, password);
      router.replace("/overview");
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(`Your account is ready, but signing in failed: ${err instanceof ApiClientError ? err.message : firebaseMessage(err)} Go to sign in.`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Your name" error={fields.displayName} hint="How teammates will see you.">{(p) => <Input {...p} autoComplete="name" value={displayName} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Password" error={fields.password} hint="At least 10 characters, with a letter and a number.">{(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
      <Field label="Confirm password" error={fields.confirm}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" loading={busy} className="w-full">Create account</Button>
    </form>
  );
}

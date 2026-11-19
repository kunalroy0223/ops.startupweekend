"use client";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { AuthCard, AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/api";
import { clientAuth } from "@/lib/firebase-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { mode } = await api<{ mode: "server" | "firebase" }>("/api/auth/password-reset", { body: { email: email.trim() } });
      if (mode === "firebase") {
        const auth = await clientAuth();
        // Same neutral outcome whether or not the account exists.
        await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/login` }).catch(() => undefined);
      }
      setSent(true);
      toast({ tone: "success", title: "Request received", message: "If the address has an account, a reset link is on its way." });
    } catch (err) {
      const msg = err instanceof ApiClientError ? (err.fields.email ?? err.message) : "Something went wrong. Try again.";
      setError(msg);
      toast({ tone: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame headline={<>Locked <span className="hl">out?</span> It happens.</>}>
      <AuthCard eyebrow="Password reset" title="Reset your password">
        {sent ? (
          <div className="grid gap-4">
            <InlineAlert tone="success" title="Check your inbox">
              If {email} belongs to an active account, a reset link is on its way. It expires in one hour.
            </InlineAlert>
            <Link href="/login" className="text-[13px] font-semibold underline underline-offset-4">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <p className="text-[13px] text-fg-2">Enter the email you use for Inhub Workspace and we&apos;ll send a link to choose a new password.</p>
            <Field label="Work email" error={error ?? undefined}>
              {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            <Button type="submit" variant="primary" loading={busy} disabled={!email} className="w-full">
              Send reset link
            </Button>
            <Link href="/login" className="justify-self-center text-[13px] font-semibold text-fg-2 underline underline-offset-4">
              Back to sign in
            </Link>
          </form>
        )}
      </AuthCard>
    </AuthFrame>
  );
}

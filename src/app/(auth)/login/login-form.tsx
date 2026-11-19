
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { firebaseMessage } from "@/components/auth/firebase-errors";
import { signInAndCreateSession } from "@/components/auth/sign-in";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/states";
import { ApiClientError } from "@/lib/api";
import { FormError } from "@/components/ui/toast";

const ALLOWED_DOMAIN = "@startupweekend.sbs";

export function LoginForm({
  next,
  notice,
  configProblems,
}: {
  next: string;
  notice: string | null;
  configProblems: string[];
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.endsWith(ALLOWED_DOMAIN)) {
      setError("Only @startupweekend.sbs email addresses are allowed.");
      return;
    }

    if (normalizedEmail.slice(0, -ALLOWED_DOMAIN.length).length === 0) {
      setError("Please enter a valid work email address.");
      return;
    }

    setBusy(true);

    try {
      await signInAndCreateSession(normalizedEmail, password);
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : firebaseMessage(err)
      );
      setBusy(false);
    }
  }

  if (configProblems.length) {
    return (
      <InlineAlert tone="warning" title="Sign-in isn't configured yet">
        Set {configProblems.join(", ")} in the environment. See README →
        Configuration.
      </InlineAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {notice ? <InlineAlert tone="info">{notice}</InlineAlert> : null}

      <Field label="Work email">
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="name@startupweekend.sbs"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            required
          />
        )}
      </Field>

      <p className="-mt-2 text-xs text-fg-2">
        Use your @startupweekend.sbs email address.
      </p>

      <Field label="Password">
        {(p) => (
          <div className="relative">
            <Input
              {...p}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-11"
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-fg-2 transition-colors hover:text-fg"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </Field>

      <FormError message={error} />

      <Button
        type="submit"
        variant="primary"
        loading={busy}
        disabled={!email.trim() || !password || busy}
        className="mt-1 w-full"
      >
        Sign in
      </Button>

      <Link
        href="/forgot-password"
        className="justify-self-center text-[13px] font-semibold text-fg-2 underline decoration-line-strong decoration-1 underline-offset-4 hover:text-fg"
      >
        Forgot your password?
      </Link>
    </form>
  );
}


import type { Metadata } from "next";
import { AuthCard, AuthFrame } from "@/components/auth/auth-frame";
import { publicEnvProblems } from "@/lib/public-env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const REASONS: Record<string, string> = {
  suspended: "Your account is suspended. Contact an Inhub Admin.",
  deactivated: "Your account has been deactivated. Contact an Inhub Admin.",
  invited: "Your account setup isn't finished. Use your invitation link.",
  missing_profile:
    "This sign-in isn't linked to an Inhub Workspace account. Ask an Admin for an invitation.",
  wrong_organisation: "This account belongs to a different organisation.",
  expired: "Your session ended. Sign in again.",
  signed_out: "You're signed out.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const { reason, next } = await searchParams;

  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/overview";

  return (
    <AuthFrame showBrandPanel={false}>
      <AuthCard
        eyebrow="Inhub Workspace"
        title={
          <>
            Welcome <span className="hl">back</span>.
          </>
        }
      >
        <LoginForm
          next={safeNext}
          notice={reason ? (REASONS[reason] ?? null) : null}
          configProblems={publicEnvProblems()}
        />
      </AuthCard>

      <p className="mt-6 text-center text-xs text-fg-2">
        Access is by invitation only. Ask an Inhub Admin if you need an account.
      </p>
    </AuthFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, AuthFrame } from "@/components/auth/auth-frame";
import { InlineAlert } from "@/components/ui/states";
import { ROLE_LABEL } from "@/domain/types";
import { lookupInvitation } from "@/server/services/invitations";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept invitation", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const PROBLEMS = {
  invalid: "This invitation link isn't valid. Check you copied the whole link.",
  expired: "This invitation has expired. Ask your Admin to resend it.",
  used: "This invitation has already been used. Sign in instead.",
  revoked: "This invitation was withdrawn. Ask your Admin if you still need access.",
} as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await lookupInvitation(token);
  return (
    <AuthFrame sticker="You're invited" headline={<>Pull up a <span className="hl">chair</span>.</>}>
      <AuthCard eyebrow="Invitation" title="Set up your account">
        {inv.state === "valid" ? (
          <>
            <p className="mb-5 text-[13px] text-fg-2">
              {inv.inviterName} invited <span className="font-semibold text-fg">{inv.email}</span> to join as {ROLE_LABEL[inv.intendedRole]}.
            </p>
            <AcceptForm token={token} email={inv.email} />
          </>
        ) : (
          <div className="grid gap-4">
            <InlineAlert tone={inv.state === "used" ? "info" : "danger"}>{PROBLEMS[inv.state]}</InlineAlert>
            <Link href="/login" className="text-[13px] font-semibold underline underline-offset-4">Go to sign in</Link>
          </div>
        )}
      </AuthCard>
    </AuthFrame>
  );
}

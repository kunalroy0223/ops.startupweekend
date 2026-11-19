import type { Metadata } from "next";
import { AuthCard, AuthFrame } from "@/components/auth/auth-frame";
import { InlineAlert } from "@/components/ui/states";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ oobCode?: string }> }) {
  const { oobCode } = await searchParams;
  return (
    <AuthFrame headline={<>A fresh <span className="hl">start</span>.</>}>
      <AuthCard eyebrow="Password reset" title="Choose a new password">
        {oobCode ? <ResetForm oobCode={oobCode} /> : <InlineAlert tone="danger">This link is incomplete. Open the link from your email again, or request a new one.</InlineAlert>}
      </AuthCard>
    </AuthFrame>
  );
}

import { Ban, CircleCheck, CircleDashed, CirclePause, Crown, Mail, Shield, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { ROLE_LABEL, USER_STATUS_LABEL, type Role, type UserStatus } from "@/domain/types";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "info" | "success" | "warning" | "danger" | "slate" | "inverse";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-fg-2 border-line",
  accent: "bg-accent-soft text-accent-text border-transparent",
  info: "bg-info-soft text-info border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  slate: "bg-slate-soft text-fg border-transparent",
  inverse: "bg-inverse text-fg-inverse border-transparent",
};

/** Status is always text plus icon, never colour alone. */
export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const STATUS: Record<UserStatus, { tone: Tone; icon: ReactNode }> = {
  active: { tone: "success", icon: <CircleCheck aria-hidden /> },
  invited: { tone: "info", icon: <Mail aria-hidden /> },
  suspended: { tone: "warning", icon: <CirclePause aria-hidden /> },
  deactivated: { tone: "neutral", icon: <Ban aria-hidden /> },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge tone={STATUS[status].tone} icon={STATUS[status].icon}>
      {USER_STATUS_LABEL[status]}
    </Badge>
  );
}

const ROLE: Record<Role, { tone: Tone; icon: ReactNode }> = {
  admin: { tone: "inverse", icon: <Crown aria-hidden /> },
  lead: { tone: "accent", icon: <Shield aria-hidden /> },
  member: { tone: "slate", icon: <UserRound aria-hidden /> },
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge tone={ROLE[role].tone} icon={ROLE[role].icon}>
      {ROLE_LABEL[role]}
    </Badge>
  );
}

export function ArchivedBadge() {
  return (
    <Badge tone="neutral" icon={<CircleDashed aria-hidden />}>
      Archived
    </Badge>
  );
}

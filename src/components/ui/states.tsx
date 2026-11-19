import { AlertTriangle, CircleCheck, Info, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { WiggleIcon } from "@/components/motion/anime-fx";
import { Orbit } from "./signal";

export function EmptyState({ title, children, action, compact, icon }: { title: string; children?: ReactNode; action?: ReactNode; compact?: boolean; icon?: ReactNode }) {
  return (
    <div className={cn("dotgrid grid justify-items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-line px-6 text-center", compact ? "py-8" : "py-14")}>
      <div className="relative">
        <Orbit className={compact ? "size-12" : "size-20"} />
        {icon ? (
          <WiggleIcon className="icon-tile absolute -right-3 -bottom-1 size-8 rotate-[-6deg] [&_svg]:size-4">{icon}</WiggleIcon>
        ) : null}
      </div>
      <h3 className="display text-base">{title}</h3>
      {children ? <div className="max-w-md text-[13px] text-fg-2">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

const ALERT = {
  info: { cls: "bg-info-soft text-info", icon: Info },
  success: { cls: "bg-success-soft text-success", icon: CircleCheck },
  warning: { cls: "bg-warning-soft text-warning", icon: AlertTriangle },
  danger: { cls: "bg-danger-soft text-danger", icon: OctagonAlert },
} as const;

export function InlineAlert({ tone = "info", title, children, action, className }: { tone?: keyof typeof ALERT; title?: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  const { cls, icon: Icon } = ALERT[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-[var(--radius-control)] px-3.5 py-3 text-[13px]", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-fg">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-fg-2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-md bg-muted", className)} />;
}

export function ErrorState({ title = "This page didn't load", children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-[var(--radius-panel)] border-[1.5px] border-line-strong bg-surface p-6 shadow-hard">
      <span className="sticker !bg-danger-soft">Error</span>
      <h2 className="display text-xl">{title}</h2>
      {children ? <div className="max-w-prose text-sm text-fg-2">{children}</div> : null}
      {action}
    </div>
  );
}

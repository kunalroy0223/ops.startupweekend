import type { ReactNode } from "react";
import { HeadlineReveal } from "@/components/motion/gsap-fx";
import { MotionSection } from "@/components/motion/reveal";
import { WiggleIcon } from "@/components/motion/anime-fx";
import { cn } from "@/lib/cn";

/**
 * Operational page header: small mono eyebrow, a confident (not oversized)
 * title with an inked icon tile, optional description and right-aligned actions.
 * `icon` is a rendered element (e.g. <Users />) so it can cross the server/client boundary.
 */
export function PageHeader({ eyebrow, title, description, actions, meta, icon, className }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex min-w-0 flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-4">
        {icon ? (
          <WiggleIcon className="icon-tile mt-1 hidden size-12 shrink-0 sm:inline-grid [&_svg]:size-6">{icon}</WiggleIcon>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
          <HeadlineReveal className="display text-[26px] sm:text-[30px]">{title}</HeadlineReveal>
          {description ? <p className="mt-2 max-w-2xl text-sm text-fg-2">{description}</p> : null}
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({ title, count, action, id, icon }: { title: string; count?: number; action?: ReactNode; id?: string; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="flex min-w-0 flex-wrap items-center gap-2 text-[15px] font-bold">
        {icon ? <span className="grid size-6 place-items-center rounded-md bg-accent-soft text-accent-text [&_svg]:size-3.5" aria-hidden>{icon}</span> : null}
        {title}
        {count !== undefined ? <span className="font-mono text-xs font-medium text-fg-3 tabular">{count}</span> : null}
      </h2>
      {action}
    </div>
  );
}

export function Panel({ children, className, as = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "aside"; "aria-labelledby"?: string }) {
  return (
    <MotionSection as={as} className={cn("min-w-0 max-w-full rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5", className)} {...rest}>
      {children}
    </MotionSection>
  );
}

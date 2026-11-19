import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp } from "@/components/motion/gsap-fx";
import { cn } from "@/lib/cn";

/** Typographic metric: big tabular numeral, small label. Grouped with dividers, not boxed. */
export function Metric({ label, value, hint, href, emphasis, icon }: { label: string; value: number | string; hint?: ReactNode; href?: string; emphasis?: boolean; icon?: ReactNode }) {
  const body = (
    <>
      <span className="eyebrow flex items-center gap-1.5">{icon ? <span className="text-fg-3 [&_svg]:size-3.5" aria-hidden>{icon}</span> : null}{label}</span>
      <CountUp value={value} className={cn("display tabular mt-1 block text-[34px] leading-none", emphasis && "text-accent-text")} />
      {hint ? <span className="mt-1.5 block text-xs text-fg-2">{hint}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className="group block rounded-md px-1 py-1 -mx-1 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-muted">
      {body}
    </Link>
  ) : (
    <div className="px-1 py-1">{body}</div>
  );
}

export function MetricRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] lg:divide-x lg:divide-line [&>*]:lg:pl-6 [&>*:first-child]:lg:pl-0", className)}>{children}</div>;
}

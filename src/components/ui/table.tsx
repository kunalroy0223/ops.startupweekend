import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Calm data table: hairline rows, sticky header, horizontal scroll with a visible edge on narrow screens. */
export function Table({ children, caption, className }: { children: ReactNode; caption: string; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-surface", className)}>
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("sticky top-0 border-b border-line bg-muted px-4 py-2.5 text-left font-mono text-[11px] font-medium tracking-[0.06em] text-fg-2 uppercase", className)} {...rest} />;
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...rest} />;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("transition-colors hover:bg-canvas [&:last-child>td]:border-b-0", className)}>{children}</tr>;
}

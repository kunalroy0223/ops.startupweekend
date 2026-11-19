import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const FILLS = ["bg-accent-soft", "bg-slate-soft", "bg-info-soft", "bg-warning-soft"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Initial disc with an inked outline and offset shadow, after the "Meet the Makers" row in design.webp. */
export function Avatar({ name, seed, size = "md", className }: { name: string; seed?: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const s = { sm: "size-7 text-[11px] border-[1.5px]", md: "size-9 text-[13px] border-[1.5px]", lg: "size-12 text-base border-2", xl: "size-20 text-2xl border-2 shadow-hard" }[size];
  return (
    <span aria-hidden="true" className={cn("display inline-grid shrink-0 place-items-center rounded-full border-line-strong text-fg !tracking-normal", FILLS[hash(seed ?? name) % FILLS.length], s, className)}>
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }: { people: { uid: string; displayName: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  if (!people.length) return <span className="text-[13px] text-fg-3">None assigned</span>;
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.uid} title={p.displayName} className={cn(i > 0 && "-ml-2")}>
          <Avatar name={p.displayName} seed={p.uid} size="sm" />
        </span>
      ))}
      {extra > 0 ? <span className="ml-1.5 text-xs font-semibold text-fg-2">+{extra}</span> : null}
      <span className="sr-only">{people.map((p) => p.displayName).join(", ")}</span>
    </span>
  );
}

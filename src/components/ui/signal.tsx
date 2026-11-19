"use client";
import { useOrbitMotion } from "@/components/motion/anime-fx";
import { cn } from "@/lib/cn";

/**
 * Signature "orbit" motif: an inked core with two offset orbits and a green
 * satellite. Used for empty states and loading only, never behind dense content.
 * Animated with anime.js (satellite orbit, breathing core, bobbing square);
 * static when the user prefers reduced motion.
 */
export function Orbit({ className, animated = true }: { className?: string; animated?: boolean }) {
  const ref = useOrbitMotion(animated);
  return (
    <svg ref={ref} viewBox="0 0 120 120" className={cn("overflow-visible text-fg", className)} aria-hidden="true">
      <ellipse data-ring cx="60" cy="60" rx="52" ry="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" transform="rotate(-18 60 60)" opacity="0.5" />
      <ellipse data-ring cx="60" cy="60" rx="40" ry="40" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <g data-core style={{ transformOrigin: "60px 60px", transformBox: "view-box" }}>
        <circle cx="63" cy="63" r="17" fill="var(--shadow-ink)" />
        <circle cx="60" cy="60" r="17" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
        <circle cx="60" cy="60" r="5" fill="currentColor" />
      </g>
      <g data-satellite style={{ transformOrigin: "60px 60px", transformBox: "view-box" }}>
        <circle cx="102" cy="44" r="7" fill="var(--accent)" stroke="var(--brand-black)" strokeWidth="2" />
      </g>
      <g data-square style={{ transformOrigin: "19px 85px", transformBox: "view-box" }}>
        <rect x="14" y="80" width="10" height="10" fill="var(--brand-slate)" stroke="currentColor" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-[50vh] place-items-center">
      <div className="grid justify-items-center gap-3">
        <Orbit className="size-16" />
        <span className="eyebrow">{label}…</span>
      </div>
    </div>
  );
}

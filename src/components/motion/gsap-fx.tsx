"use client";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(useGSAP);

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Identity-moment headline: words rise and the highlighted `.hl` boxes sweep in.
 * Text stays in the DOM, so it is readable without JS and by screen readers.
 */
export function HeadlineReveal({ children, className, as: As = "h1" }: { children: ReactNode; className?: string; as?: "h1" | "h2" | "p" | "div" }) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (reduced() || !ref.current) return;
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      tl.from(ref.current, { y: 28, opacity: 0, skewY: 2, duration: 0.8 });
      const hl = ref.current.querySelectorAll(".hl");
      if (hl.length) tl.from(hl, { clipPath: "inset(0 100% 0 0)", duration: 0.6, stagger: 0.1 }, "-=0.45");
      const stickers = ref.current.querySelectorAll(".sticker");
      if (stickers.length) tl.from(stickers, { scale: 0, rotate: -25, duration: 0.5, ease: "back.out(2.4)" }, "-=0.3");
    },
    { scope: ref },
  );
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <As ref={ref as any} className={className}>
      {children}
    </As>
  );
}

/** Animated count-up for a numeric metric. Non-numeric values render as-is. */
export function CountUp({ value, className }: { value: number | string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (typeof value !== "number" || reduced() || !ref.current) return;
      const el = ref.current;
      const obj = { n: 0 };
      gsap.to(obj, { n: value, duration: 1.1, ease: "power3.out", onUpdate: () => (el.textContent = Math.round(obj.n).toLocaleString("en-IN")) });
    },
    { dependencies: [value] },
  );
  return (
    <span ref={ref} className={className}>
      {typeof value === "number" ? value.toLocaleString("en-IN") : value}
    </span>
  );
}

/** Draws SVG strokes (paths/lines/rects marked `data-draw`) and pops shapes marked `data-pop`. */
export function DrawIn({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reduced() || !ref.current) return;
      const strokes = ref.current.querySelectorAll<SVGGeometryElement>("[data-draw]");
      strokes.forEach((s) => {
        const len = typeof s.getTotalLength === "function" ? s.getTotalLength() : 400;
        gsap.fromTo(s, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut", delay: 0.2, clearProps: "strokeDasharray,strokeDashoffset" });
      });
      gsap.from(ref.current.querySelectorAll("[data-pop]"), { scale: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.55, ease: "back.out(2)", stagger: 0.08, delay: 0.5 });
      gsap.from(ref.current.querySelectorAll("[data-slide]"), { x: -24, opacity: 0, duration: 0.6, ease: "power3.out", stagger: 0.07, delay: 0.3 });
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

"use client";
import { animate, createTimeline, stagger } from "animejs";
import { useEffect, useRef, type ReactNode } from "react";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * anime.js micro-interactions for the Orbit motif: the satellite orbits, the
 * core breathes and the slate square bobs. Used by empty states and loaders.
 */
export function useOrbitMotion(enabled = true) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!enabled || !svg || reduced()) return;
    const anims = [
      animate(svg.querySelector("[data-satellite]")!, { rotate: 360, duration: 6000, ease: "linear", loop: true }),
      animate(svg.querySelector("[data-core]")!, { scale: [1, 1.08, 1], duration: 2400, ease: "inOutSine", loop: true }),
      animate(svg.querySelector("[data-square]")!, { translateY: [0, -6, 0], rotate: [12, 24, 12], duration: 3200, ease: "inOutQuad", loop: true }),
      animate(svg.querySelectorAll("[data-ring]"), { opacity: [0.2, 0.55, 0.2], duration: 2800, delay: stagger(500), ease: "inOutSine", loop: true }),
    ];
    return () => anims.forEach((a) => a.revert());
  }, [enabled]);
  return ref;
}

/** Icon that gives a small springy wiggle on mount and on hover. */
export function WiggleIcon({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    const play = () => animate(el, { rotate: [0, -14, 10, -6, 0], scale: [1, 1.15, 1], duration: 700, ease: "outElastic(1, .6)" });
    const intro = play();
    el.addEventListener("mouseenter", play);
    return () => {
      intro.revert();
      el.removeEventListener("mouseenter", play);
    };
  }, []);
  return (
    <span ref={ref} className={className} style={{ display: "inline-grid", placeItems: "center" }}>
      {children}
    </span>
  );
}

/** Burst of small brand-coloured particles from the element. Used by success pop-ups. */
export function useSuccessBurst() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || reduced()) return;
    const dots = Array.from({ length: 8 }, (_, i) => {
      const d = document.createElement("i");
      d.style.cssText = `position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px;border-radius:${i % 2 ? "0" : "50%"};background:${i % 3 === 0 ? "var(--brand-slate)" : "var(--accent)"};pointer-events:none`;
      host.appendChild(d);
      return d;
    });
    const tl = createTimeline({ onComplete: () => dots.forEach((d) => d.remove()) });
    dots.forEach((d, i) => {
      const a = (i / dots.length) * Math.PI * 2;
      tl.add(d, { translateX: Math.cos(a) * 22, translateY: Math.sin(a) * 22, scale: [1, 0], opacity: [1, 0], duration: 650, ease: "outCubic" }, 0);
    });
    tl.add(host.querySelector("svg")!, { scale: [0.4, 1], rotate: [-30, 0], duration: 600, ease: "outElastic(1, .5)" }, 0);
    return () => {
      tl.revert();
      dots.forEach((d) => d.remove());
    };
  }, []);
  return ref;
}

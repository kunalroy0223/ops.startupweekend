"use client";
import Lenis from "lenis";
import { MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Global motion provider.
 * - Lenis smooth scrolling on the window, driven by GSAP's ticker so ScrollTrigger stays in sync.
 * - Skipped entirely when the user prefers reduced motion.
 * - Any element with `data-lenis-prevent` (dialogs, menus, scroll areas, the sidebar) scrolls natively.
 * - Framer Motion respects the OS reduced-motion setting via MotionConfig.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (reduced()) return;
    const lenis = new Lenis({ duration: 1.05, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true, prevent: (node) => node.closest?.("dialog,[data-lenis-prevent]") !== null });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    // Pause page scrolling while a modal dialog is open.
    const obs = new MutationObserver(() => (document.querySelector("dialog[open]") ? lenis.stop() : lenis.start()));
    obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => {
      obs.disconnect();
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // New page starts at the top, without a smooth scroll animation.
  useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return (
<MotionConfig reducedMotion="user">{children}</MotionConfig>
  );
}

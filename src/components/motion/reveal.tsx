"use client";
import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Page enter transition (used by the (app) template so it replays on every navigation). */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
      {children}
    </motion.div>
  );
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } };

/** Staggered entrance for a group of blocks. Children should be <StaggerItem>. */
export function Stagger({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "section" }) {
  const C = as === "ul" ? motion.ul : as === "section" ? motion.section : motion.div;
  return (
    <C className={className} variants={container} initial="hidden" animate="show">
      {children}
    </C>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const C = as === "li" ? motion.li : motion.div;
  return (
    <C className={className} variants={item}>
      {children}
    </C>
  );
}

/** Fades a block in as it scrolls into view (once). */
export function InView({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Section that rises in when it enters the viewport. Keeps its own className so grid spans still apply. */
export function MotionSection({ children, className, as = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "aside"; "aria-labelledby"?: string }) {
  const C = as === "div" ? motion.div : as === "aside" ? motion.aside : motion.section;
  return (
    <C className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ duration: 0.45, ease: EASE }} {...rest}>
      {children}
    </C>
  );
}

"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Disclosure menu: Escape and outside click close it; focus returns to the trigger. */
export function Menu({ trigger, label, children, align = "end", className }: { trigger: ReactNode; label: string; children: (close: () => void) => ReactNode; align?: "start" | "end"; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className={cn("relative", className)}>
      <button ref={button} type="button" aria-haspopup="true" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((v) => !v)} className="rounded-[var(--radius-control)]">
        {trigger}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={id}
            data-lenis-prevent
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
            style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
            className={cn("absolute z-40 mt-2 min-w-56 rounded-[var(--radius-panel)] border-[1.5px] border-line-strong bg-raised p-1.5 shadow-hard", align === "end" ? "right-0" : "left-0")}
          >
            {children(() => setOpen(false))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({ children, onSelect, href, icon, tone }: { children: ReactNode; onSelect?: () => void; href?: string; icon?: ReactNode; tone?: "danger" }) {
  const cls = cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted [&_svg]:size-4 [&_svg]:text-fg-2", tone === "danger" && "text-danger [&_svg]:text-danger");
  if (href)
    return (
      <a href={href} className={cls}>
        {icon}
        {children}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={onSelect}>
      {icon}
      {children}
    </button>
  );
}

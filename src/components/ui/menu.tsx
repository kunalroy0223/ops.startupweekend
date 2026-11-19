"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type MenuPosition = {
  top: number;
  left: number;
};

/**
 * Disclosure menu rendered through a portal to avoid clipping
 * from overflow, transformed parents, tables, and scroll containers.
 *
 * Escape and outside click close it; focus returns to the trigger.
 * The menu automatically adjusts its position near viewport edges.
 */
export function Menu({
  trigger,
  label,
  children,
  align = "end",
  className,
}: {
  trigger: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const id = useId();

  // Position the menu relative to the trigger, using viewport coordinates.
  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const triggerRect = button.current?.getBoundingClientRect();
      const menuElement = menu.current;

      if (!triggerRect || !menuElement) return;

      const menuWidth = menuElement.offsetWidth;
      const menuHeight = menuElement.offsetHeight;

      const gutter = 8;
      const gap = 8;

      // Horizontal alignment with viewport boundary protection.
      const desiredLeft =
        align === "end"
          ? triggerRect.right - menuWidth
          : triggerRect.left;

      const maxLeft = Math.max(
        gutter,
        window.innerWidth - menuWidth - gutter,
      );

      const left = Math.min(Math.max(gutter, desiredLeft), maxLeft);

      // Prefer opening below; flip above when there is insufficient space.
      const belowTop = triggerRect.bottom + gap;
      const belowSpace = window.innerHeight - belowTop - gutter;
      const aboveSpace = triggerRect.top - gap - gutter;

      let top = belowTop;

      if (menuHeight > belowSpace && aboveSpace > belowSpace) {
        top = triggerRect.top - menuHeight - gap;
      }

      // Keep the complete menu within the viewport.
      const maxTop = Math.max(
        gutter,
        window.innerHeight - menuHeight - gutter,
      );

      top = Math.min(Math.max(gutter, top), maxTop);

      setPosition({ top, left });
    };

    updatePosition();

    // Reposition when the viewport or any scroll container changes.
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, align]);

  // Handle outside clicks and Escape, including clicks inside the portal.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        root.current?.contains(target) ||
        menu.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div ref={root} className={cn("relative", className)}>
        <button
          ref={button}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={id}
          aria-label={label}
          onClick={() => setOpen((value) => !value)}
          className="rounded-[var(--radius-control)]"
        >
          {trigger}
        </button>
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={menu}
                  id={id}
                  data-lenis-prevent
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    y: -4,
                    scale: 0.98,
                    transition: { duration: 0.12 },
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 520,
                    damping: 34,
                  }}
                  style={{
                    position: "fixed",
                    top: position?.top ?? 0,
                    left: position?.left ?? 0,
                    visibility: position ? "visible" : "hidden",
                    transformOrigin:
                      align === "end" ? "top right" : "top left",
                  }}
                  className="z-[1000] min-w-56 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-[var(--radius-panel)] border-[1.5px] border-line-strong bg-raised p-1.5 shadow-hard"
                >
                  {children(() => setOpen(false))}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

export function MenuItem({
  children,
  onSelect,
  href,
  icon,
  tone,
}: {
  children: ReactNode;
  onSelect?: () => void;
  href?: string;
  icon?: ReactNode;
  tone?: "danger";
}) {
  const cls = cn(
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted [&_svg]:size-4 [&_svg]:text-fg-2",
    tone === "danger" && "text-danger [&_svg]:text-danger",
  );

  if (href) {
    return (
      <a href={href} className={cls}>
        {icon}
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={cls} onClick={onSelect}>
      {icon}
      {children}
    </button>
  );
}

"use client";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheckBig, Info, OctagonAlert, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useSuccessBurst } from "@/components/motion/anime-fx";
import { InlineAlert } from "./states";

/**
 * Pop-up notifications for the result of an action. The app never uses
 * window.alert/confirm: results go here, decisions go to <ConfirmDialog>.
 */
type Tone = "success" | "danger" | "info" | "warning";
type ToastInput = { tone: Tone; message: ReactNode; title?: string; duration?: number };
type Toast = ToastInput & { id: number };

const TONE: Record<Tone, { icon: LucideIcon; title: string; ring: string; chip: string; bar: string }> = {
  success: { icon: CircleCheckBig, title: "Done", ring: "border-line-strong", chip: "bg-accent text-ink", bar: "bg-accent" },
  danger: { icon: OctagonAlert, title: "Something went wrong", ring: "border-danger", chip: "bg-danger text-white", bar: "bg-danger" },
  warning: { icon: TriangleAlert, title: "Heads up", ring: "border-line-strong", chip: "bg-warning text-ink", bar: "bg-warning" },
  info: { icon: Info, title: "Note", ring: "border-line-strong", chip: "bg-inverse text-fg-inverse", bar: "bg-slate" },
};

const Ctx = createContext<(t: ToastInput) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] grid justify-items-end gap-2.5 sm:left-auto">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

function ToastIcon({ tone }: { tone: Tone }) {
  const burst = useSuccessBurst();
  const { icon: Icon, chip } = TONE[tone];
  return (
    <span ref={tone === "success" ? burst : undefined} className={cn("relative grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink", chip)}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function ToastCard({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const duration = t.duration ?? (t.tone === "danger" ? 7000 : 4500);
  const [paused, setPaused] = useState(false);
  const left = useRef(duration);
  const started = useRef(0);
  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const timer = setTimeout(onDismiss, left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started.current;
    };
  }, [paused, onDismiss]);
  const meta = TONE[t.tone];
  return (
    <motion.div
      layout
      role={t.tone === "danger" ? "alert" : "status"}
      initial={{ opacity: 0, y: 24, scale: 0.92, rotate: -1.5 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, x: 60, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.6 }}
      onDragEnd={(_, info) => info.offset.x > 80 && onDismiss()}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn("pointer-events-auto relative w-[min(92vw,380px)] overflow-hidden rounded-[var(--radius-control)] border-[1.5px] bg-raised shadow-hard", meta.ring)}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <ToastIcon tone={t.tone} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13px] font-bold">{t.title ?? meta.title}</p>
          <div className="mt-0.5 text-[13px] text-fg-2">{t.message}</div>
        </div>
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="-mr-1 grid size-7 place-items-center rounded-md text-fg-3 hover:bg-muted hover:text-fg">
          <X className="size-4" />
        </button>
      </div>
      <motion.span
        aria-hidden
        className={cn("absolute bottom-0 left-0 h-[3px] w-full origin-left", meta.bar)}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: paused ? undefined : 0 }}
        transition={{ duration: duration / 1000, ease: "linear" }}
      />
    </motion.div>
  );
}

export const useToast = () => useContext(Ctx);

/**
 * Inline error that also raises an error pop-up whenever the message changes,
 * so failures are never missed even when the form is scrolled out of view.
 */
export function FormError({ message, title }: { message: string | null | undefined; title?: string }) {
  const toast = useToast();
  useEffect(() => {
    if (message) toast({ tone: "danger", message, title });
  }, [message, title, toast]);
  return message ? (
    <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} transition={{ duration: 0.4 }}>
      <InlineAlert tone="danger">{message}</InlineAlert>
    </motion.div>
  ) : null;
}

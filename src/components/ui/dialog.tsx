"use client";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { FormError } from "./toast";

/**
 * Native <dialog>: focus is trapped and Escape closes it by the platform, and
 * focus returns to the invoking control on close. Full-screen sheet on mobile.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-visible bg-transparent p-0 text-fg backdrop:backdrop-blur-[1px] sm:m-auto",
        { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl" }[size],
      )}
    >
      {open ? (
        <motion.div
          data-lenis-prevent
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="inked flex max-h-[92dvh] flex-col rounded-t-[var(--radius-feature)] bg-raised sm:rounded-[var(--radius-panel)]"
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 pt-5 pb-4 sm:px-6">
            <div>
              <h2 id="dialog-title" className="display text-lg">
                {title}
              </h2>
              {description ? <div className="mt-1 text-[13px] text-fg-2">{description}</div> : null}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 grid size-9 place-items-center rounded-md text-fg-2 hover:bg-muted hover:text-fg">
              <X className="size-4" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">{footer}</footer> : null}
        </motion.div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  consequence,
  confirmLabel,
  tone = "primary",
  loading,
  error,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  error?: string | null;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 text-sm text-fg-2">
        <div>{consequence}</div>
        {children}
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

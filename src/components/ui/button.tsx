import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md";

const base =
  "nudge inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap rounded-[var(--radius-control)] select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2";

const variants: Record<Variant, string> = {
  // Inked black button with the brand-green hard shadow ("Upgrade Now" in design.webp).
  primary: "press bg-inverse text-fg-inverse border-2 border-line-strong shadow-[3px_3px_0_0_var(--accent)]",
  accent: "press bg-accent text-accent-on border-2 border-[var(--brand-black)] shadow-[3px_3px_0_0_var(--brand-black)]",
  secondary: "press bg-surface text-fg border-[1.5px] border-line-strong shadow-hard-sm",
  ghost: "text-fg-2 hover:text-fg hover:bg-muted",
  danger: "press bg-danger text-white border-2 border-line-strong shadow-hard-sm dark:text-black",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "secondary", size = "md", icon, className, children, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn("inline-grid size-9 place-items-center rounded-[var(--radius-control)] text-fg-2 hover:bg-muted hover:text-fg", className)} {...rest}>
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 animate-spin", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

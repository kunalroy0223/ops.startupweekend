"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing, ChevronsLeft, ChevronsRight, LogOut, Menu as MenuIcon, Monitor, Moon, Search, SlidersHorizontal, Sun, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { NavKey } from "@/domain/authz";
import { ROLE_LABEL, type Role } from "@/domain/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { WiggleIcon } from "../motion/anime-fx";
import { Avatar } from "../ui/avatar";
import { Menu, MenuItem } from "../ui/menu";
import { CRUMB_LABEL, GROUP_LABEL, NAV } from "./nav-config";

export interface ShellUser {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
}

// Sidebar preference lives in localStorage (a per-viewer convenience), read through an external store.
const listeners = new Set<() => void>();
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem("sidebar") === "collapsed";
  } catch {
    return false;
  }
}
function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem("sidebar", value ? "collapsed" : "expanded");
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function AppShell({ nav, user, unread, children }: { nav: NavKey[]; user: ShellUser; unread: number; children: ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  const toggle = () => writeCollapsed(!collapsed);

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Desktop / tablet sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface md:flex", collapsed ? "w-[72px]" : "w-[72px] lg:w-[248px]")} aria-label="Primary">
        <SidebarBody nav={nav} pathname={pathname} collapsed={collapsed} onToggle={toggle} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
      {drawer ? (
        <div data-lenis-prevent className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <motion.button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/45" onClick={() => setDrawer(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 400, damping: 40 }} className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r-2 border-line-strong bg-surface shadow-hard-lg">
            <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="absolute top-4 right-3 grid size-9 place-items-center rounded-md hover:bg-muted">
              <X className="size-4" />
            </button>
            <SidebarBody nav={nav} pathname={pathname} collapsed={false} forceExpanded onNavigate={() => setDrawer(false)} />
          </motion.aside>
        </div>
      ) : null}
      </AnimatePresence>

      <div className={cn("flex min-h-dvh flex-col", collapsed ? "md:pl-[72px]" : "md:pl-[72px] lg:pl-[248px]")}>
        <Topbar user={user} unread={unread} pathname={pathname} onMenu={() => setDrawer(true)} showNotifications={nav.includes("notifications")} showPeople={nav.includes("people")} />
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarBody({ nav, pathname, collapsed, onToggle, forceExpanded, onNavigate }: { nav: NavKey[]; pathname: string; collapsed: boolean; onToggle?: () => void; forceExpanded?: boolean; onNavigate?: () => void }) {
  const wide = forceExpanded || !collapsed;
  const groups = (["work", "organisation", "you"] as const).map((g) => ({ g, items: nav.filter((k) => NAV[k].group === g) })).filter((x) => x.items.length);
  return (
    <>
      <div className={cn("flex h-16 shrink-0 items-center gap-2 border-b border-line px-4", !forceExpanded && "justify-center lg:justify-start", !wide && "lg:justify-center")}>
        <Link href="/overview" className={cn("flex items-center gap-2.5 rounded-md", !forceExpanded && "max-lg:hidden", !wide && "hidden")} aria-label="Inhub Workspace home">
          <span className="rounded-md bg-white px-1.5 py-1 ring-1 ring-line">
            <Image src="/brand/inhub-ecell.png" alt="Inhub Entrepreneurship Cell" width={2715} height={1417} className="h-7 w-auto" priority />
          </span>
          <span className="display text-[13px] leading-tight">
            Work<span className="text-accent-text">space</span>
          </span>
        </Link>
        <Link href="/overview" aria-label="Inhub Workspace home" className={cn("grid h-9 w-12 place-items-center rounded-md bg-white ring-1 ring-line", forceExpanded ? "hidden" : wide ? "lg:hidden" : "")}>
          {/* The full supplied logo, scaled down; never cropped or redrawn. */}
          <Image src="/brand/inhub-ecell.png" alt="" width={2715} height={1417} className="h-auto w-10" />
        </Link>
      </div>

      <nav data-lenis-prevent className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map(({ g, items }) => (
          <div key={g} className="mb-5">
            <p className={cn("eyebrow mb-1.5 px-2.5 !text-[10px]", !forceExpanded && "max-lg:sr-only", !wide && "sr-only")}>{GROUP_LABEL[g]}</p>
            <ul className="grid gap-0.5">
              {items.map((k) => {
                const item = NAV[k];
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={k}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={!wide ? item.label : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-[13.5px] font-medium text-fg-2 transition-colors hover:bg-muted hover:text-fg",
                        active && "bg-accent-soft font-semibold text-fg",
                        !forceExpanded && "max-lg:justify-center",
                        !wide && "justify-center",
                      )}
                    >
                      {active ? <motion.span layoutId={forceExpanded ? "nav-active-drawer" : "nav-active"} transition={{ type: "spring", stiffness: 500, damping: 38 }} aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-[var(--brand-black)] dark:bg-accent" /> : null}
                      <Icon className={cn("size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6", active ? "text-fg" : "text-fg-3 group-hover:text-fg-2")} aria-hidden />
                      <span className={cn(!forceExpanded && "max-lg:sr-only", !wide && "sr-only")}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {onToggle ? (
        <div className="hidden border-t border-line p-3 lg:block">
          <button type="button" onClick={onToggle} className={cn("flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-[13px] text-fg-2 hover:bg-muted", collapsed && "justify-center")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {collapsed ? null : <span>Collapse</span>}
          </button>
        </div>
      ) : null}
    </>
  );
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => ({ href: "/" + parts.slice(0, i + 1).join("/"), label: CRUMB_LABEL[p] ?? (i > 0 ? "Details" : p) }));
  const shown = crumbs.filter((c, i) => !(c.label === "Workstream" || c.label === "Team") || i === crumbs.length - 1);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 truncate font-mono text-[11.5px] text-fg-3">
        <li className="max-sm:hidden">Inhub</li>
        {shown.map((c, i) => (
          <li key={c.href} className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden className={cn(i === 0 && "max-sm:hidden")}>/</span>
            {i === shown.length - 1 ? (
              <span aria-current="page" className="truncate text-fg-2">{c.label}</span>
            ) : (
              <Link href={c.href} className="truncate hover:text-fg">{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function setTheme(theme: "light" | "dark" | "system") {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
    document.cookie = "theme=; path=/; max-age=0; samesite=lax";
  } else {
    root.setAttribute("data-theme", theme);
    document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  }
}

function Topbar({ user, unread, pathname, onMenu, showNotifications, showPeople }: { user: ShellUser; unread: number; pathname: string; onMenu: () => void; showNotifications: boolean; showPeople: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  async function signOut() {
    await api("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
    router.replace("/login?reason=signed_out");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-sm sm:px-6 lg:px-10">
      <button type="button" onClick={onMenu} aria-label="Open navigation" className="-ml-1 grid size-9 place-items-center rounded-md hover:bg-muted md:hidden">
        <MenuIcon className="size-5" />
      </button>
      <Breadcrumbs pathname={pathname} />
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {showPeople ? (
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/people${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
            }}
            className="relative hidden sm:block"
          >
            <label htmlFor="global-search" className="sr-only">Search people</label>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="h-9 w-44 rounded-[var(--radius-control)] border border-line bg-canvas pr-3 pl-9 text-[13px] placeholder:text-fg-3 transition-[width] duration-300 focus:w-60 focus:border-line-strong focus:outline-none lg:w-56" />
          </form>
        ) : null}
        {showNotifications ? (
          <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative grid size-9 place-items-center rounded-md text-fg-2 hover:bg-muted hover:text-fg">
            {unread ? (
              <WiggleIcon>
                <BellRing className="size-[18px]" />
              </WiggleIcon>
            ) : (
              <Bell className="size-[18px]" />
            )}
            {unread ? (
              <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-[1.5px] border-[var(--brand-black)] bg-accent px-1 font-mono text-[10px] font-bold text-accent-on">{unread > 99 ? "99+" : unread}</span>
            ) : null}
          </Link>
        ) : null}
        <Menu
          label="Account menu"
          trigger={
            <span className="flex items-center gap-2 rounded-md p-1 hover:bg-muted">
              <Avatar name={user.displayName} seed={user.uid} size="sm" />
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-[13px] font-semibold">{user.displayName}</span>
                <span className="block text-[11px] text-fg-3">{ROLE_LABEL[user.role]}</span>
              </span>
            </span>
          }
        >
          {(close) => (
            <>
              <div className="border-b border-line px-2.5 pt-1.5 pb-2.5">
                <p className="text-sm font-semibold">{user.displayName}</p>
                <p className="truncate text-xs text-fg-2">{user.email}</p>
              </div>
              <div className="py-1">
                <MenuItem href={`/people/${user.uid}`} icon={<UserRound />}>Your profile</MenuItem>
                <MenuItem href="/notifications/preferences" icon={<SlidersHorizontal />}>Notification preferences</MenuItem>
              </div>
              <div className="border-y border-line px-2.5 py-2">
                <p className="eyebrow mb-1.5 !text-[10px]">Theme</p>
                <div className="grid grid-cols-3 gap-1">
                  {([["light", Sun], ["dark", Moon], ["system", Monitor]] as const).map(([t, Icon]) => (
                    <button key={t} type="button" onClick={() => { setTheme(t); close(); }} className="flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px] capitalize text-fg-2 hover:bg-muted hover:text-fg">
                      <Icon className="size-4" aria-hidden />
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-1">
                <MenuItem onSelect={signOut} icon={<LogOut />}>Sign out</MenuItem>
              </div>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}

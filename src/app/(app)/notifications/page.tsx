import { Bell, BellOff, PartyPopper, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, MarkAllRead } from "@/components/notifications/inbox";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { listNotifications, unreadCount } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; cursor?: string }> }) {
  const { actor } = await requireActive();
  const { filter, cursor } = await searchParams;
  const unreadOnly = filter === "unread";
  const [{ rows, nextCursor }, unread] = await Promise.all([listNotifications(actor, { unread: unreadOnly, cursor }), unreadCount(actor)]);
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={<Bell />}
        eyebrow="Inbox"
        title="Notifications"
        description="Changes to your account, role and teams. Email copies follow your preferences."
        actions={
          <>
            <MarkAllRead disabled={!unread} />
            <LinkButton href="/notifications/preferences" icon={<SlidersHorizontal className="size-4" />}>Preferences</LinkButton>
          </>
        }
      />
      <div role="tablist" aria-label="Filter notifications" className="flex gap-1">
        {[["all", "All"], ["unread", `Unread (${unread})`]].map(([k, l]) => {
          const active = (k === "unread") === unreadOnly;
          return (
            <Link key={k} role="tab" aria-selected={active} href={k === "all" ? "/notifications" : "/notifications?filter=unread"} className={cn("rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] font-semibold", active ? "bg-inverse text-fg-inverse" : "text-fg-2 hover:bg-muted")}>
              {l}
            </Link>
          );
        })}
      </div>
      {rows.length ? (
        <>
          <Inbox items={rows.map((r) => ({ id: r.id, title: r.title, body: r.body, actionUrl: r.actionUrl, readAt: r.readAt, createdAt: r.createdAt }))} />
          {nextCursor ? <div className="flex justify-end"><LinkButton size="sm" href={`/notifications?${new URLSearchParams({ ...(unreadOnly ? { filter: "unread" } : {}), cursor: nextCursor })}`}>Older</LinkButton></div> : null}
        </>
      ) : (
        <EmptyState icon={unreadOnly ? <PartyPopper /> : <BellOff />} title={unreadOnly ? "You're all caught up" : "No notifications yet"}>{unreadOnly ? "Nothing unread." : "You'll be notified when you're added to a team, your role changes, or something needs you."}</EmptyState>
      )}
    </div>
  );
}

"use client";
import { CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  actionUrl?: string;
  readAt?: string | null;
  createdAt: string;
}

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      icon={<CheckCheck className="size-4" />}
      disabled={disabled}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/notifications/read", { body: { all: true } });
          router.refresh();
        } catch {
          toast({ tone: "danger", message: "Couldn't mark notifications as read." });
        } finally {
          setBusy(false);
        }
      }}
    >
      Mark all as read
    </Button>
  );
}

export function Inbox({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [read, setRead] = useState<Set<string>>(new Set());
  const markOne = async (id: string) => {
    setRead((s) => new Set(s).add(id));
    await api("/api/notifications/read", { body: { ids: [id] } }).catch(() => undefined);
    router.refresh();
  };
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      {items.map((n) => {
        const unread = !n.readAt && !read.has(n.id);
        const content = (
          <>
            <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rotate-45 border-[1.5px]", unread ? "border-line-strong bg-accent" : "border-line bg-transparent")} />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm", unread ? "font-bold" : "font-medium text-fg-2")}>{n.title}</span>
              <span className="mt-0.5 block text-[13px] text-fg-2">{n.body}</span>
              <span className="mt-1 block font-mono text-[11px] text-fg-3">
                {relativeTime(n.createdAt)}
                {unread ? <span className="sr-only"> · unread</span> : null}
              </span>
            </span>
          </>
        );
        return (
          <li key={n.id} className={cn(unread && "bg-accent-soft/40")}>
            {n.actionUrl ? (
              <Link href={n.actionUrl} onClick={() => unread && void markOne(n.id)} className="flex gap-3 px-4 py-3.5 hover:bg-canvas">{content}</Link>
            ) : (
              <div className="flex gap-3 px-4 py-3.5">
                {content}
                {unread ? <Button size="sm" variant="ghost" onClick={() => markOne(n.id)}>Mark read</Button> : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

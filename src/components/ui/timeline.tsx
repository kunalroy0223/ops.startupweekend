import { formatDateTime, actionLabel, relativeTime } from "@/lib/format";
import type { ReactNode } from "react";

export interface TimelineItem {
  id: string;
  actorName: string;
  action: string;
  createdAt: string;
  detail?: ReactNode;
}

/** Activity timeline: a single inked spine with square nodes. */
export function ActivityTimeline({ items, tz }: { items: TimelineItem[]; tz?: string }) {
  return (
    <ol className="relative grid gap-4 border-l-[1.5px] border-line-strong pl-5">
      {items.map((i) => (
        <li key={i.id} className="relative">
          <span aria-hidden="true" className="absolute top-1.5 -left-[25px] size-2.5 rotate-45 border-[1.5px] border-line-strong bg-accent" />
          <p className="text-[13px] leading-snug">
            <span className="font-semibold">{i.actorName}</span> <span className="text-fg-2">{actionLabel(i.action)}</span>
          </p>
          {i.detail ? <div className="mt-0.5 text-xs text-fg-2">{i.detail}</div> : null}
          <time dateTime={i.createdAt} title={formatDateTime(i.createdAt, tz)} className="mt-0.5 block font-mono text-[11px] text-fg-3">
            {relativeTime(i.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

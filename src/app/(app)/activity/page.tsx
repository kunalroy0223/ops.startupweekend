import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { isAdmin } from "@/domain/authz";
import { actionLabel, formatDateTime } from "@/lib/format";
import { getOrganization, listAudit, type AuditRow } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Activity" };

const RESOURCE_HREF: Record<string, (id: string) => string> = {
  user: (id) => `/people/${id}`,
  team: (id) => `/structure/teams/${id}`,
  workstream: (id) => `/structure/workstreams/${id}`,
  workspace: () => `/workspaces`,
};

function changeSummary(r: AuditRow): string {
  const before = r.before ?? {};
  const after = r.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !["downgradedLeadAssignments", "reason"].includes(k));
  const parts = keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && (typeof after[k] !== "object" || after[k] === null))
    .slice(0, 3)
    .map((k) => (k in before ? `${k}: ${String(before[k] ?? "—")} → ${String(after[k] ?? "—")}` : `${k}: ${String(after[k])}`));
  const reason = typeof after.reason === "string" && after.reason ? ` · “${after.reason}”` : "";
  return parts.join(" · ") + reason;
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { actor } = await requireActive();
  const { cursor } = await searchParams;
  const [{ rows, nextCursor }, org] = await Promise.all([listAudit(actor, { cursor, limit: 40 }), getOrganization()]);
  const admin = isAdmin(actor);
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={<History />}
        eyebrow={admin ? "Audit log · whole organisation" : "Your activity"}
        title="Activity"
        description={admin ? "Every invitation, role change, assignment and setting change, with who did it and when. Records can't be edited or deleted." : "Things you did, and changes other people made to your account."}
      />
      {rows.length ? (
        <>
          <Table caption="Activity log">
            <thead>
              <tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Details</Th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = RESOURCE_HREF[r.resourceType]?.(r.resourceId);
                return (
                  <Tr key={r.id}>
                    <Td className="font-mono text-xs whitespace-nowrap text-fg-2">{formatDateTime(r.createdAt, org?.timezone)}</Td>
                    <Td className="font-semibold whitespace-nowrap">{r.actorUserId === actor.uid ? "You" : r.actorName}</Td>
                    <Td>{href ? <Link href={href} className="hover:underline">{actionLabel(r.action)}</Link> : actionLabel(r.action)}</Td>
                    <Td className="max-w-md truncate text-xs text-fg-2" title={changeSummary(r)}>{changeSummary(r) || "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <nav aria-label="Pagination" className="flex justify-end gap-2">
            {cursor ? <LinkButton size="sm" href="/activity">Newest</LinkButton> : null}
            {nextCursor ? <LinkButton size="sm" href={`/activity?cursor=${nextCursor}`}>Older</LinkButton> : null}
          </nav>
        </>
      ) : (
        <EmptyState icon={<History />} title="No activity yet">Activity appears here as people are invited, assigned and changed.</EmptyState>
      )}
    </div>
  );
}

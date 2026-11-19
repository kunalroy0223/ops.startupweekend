import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { ArchiveButton, ResourceFormButton } from "@/components/structure/resource-forms";
import { ArchivedBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { hasPermission } from "@/domain/authz";
import { formatDate } from "@/lib/format";
import { getOrganization, listStructure, listWorkspaces } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const { actor } = await requireActive();
  const canManage = hasPermission(actor, "workspaces.manage");
  const [workspaces, structure, org] = await Promise.all([listWorkspaces(actor, canManage), listStructure(actor), getOrganization()]);
  return (
    <div className="grid gap-8">
      <PageHeader
        icon={<Boxes />}
        eyebrow="Organisation"
        title="Workspaces"
        description="A workspace holds workstreams, teams and, soon, projects and tasks. Most organisations only need one."
        actions={canManage ? <ResourceFormButton kind="workspaces" listenToUrl /> : null}
      />
      {workspaces.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((w, i) => {
            const streams = structure.workstreams.filter((s) => s.workspaceId === w.id).length;
            const teams = structure.teams.filter((t) => t.workspaceId === w.id).length;
            return (
              <li key={w.id} className={`rounded-[var(--radius-panel)] border-[1.5px] bg-surface p-5 ${i === 0 && w.status === "active" ? "border-line-strong shadow-hard" : "border-line"}`}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="display text-lg">{w.name}</h2>
                  {w.status === "archived" ? <ArchivedBadge /> : null}
                </div>
                <p className="mt-1.5 min-h-10 text-[13px] text-fg-2">{w.description || "No description."}</p>
                <dl className="mt-4 flex gap-6 border-t border-line pt-4 text-[13px]">
                  <div><dt className="eyebrow">Workstreams</dt><dd className="display tabular mt-0.5 text-xl">{streams}</dd></div>
                  <div><dt className="eyebrow">Teams</dt><dd className="display tabular mt-0.5 text-xl">{teams}</dd></div>
                  <div><dt className="eyebrow">Created</dt><dd className="mt-1.5 font-mono text-xs">{formatDate(w.createdAt, org?.timezone)}</dd></div>
                </dl>
                {canManage ? (
                  <div className="mt-4 flex gap-2">
                    <ResourceFormButton kind="workspaces" existing={{ id: w.id, name: w.name, description: w.description }} />
                    <ArchiveButton kind="workspaces" id={w.id} name={w.name} archived={w.status === "archived"} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Boxes />} title="No workspace yet" action={canManage ? <ResourceFormButton kind="workspaces" /> : null}>
          {canManage ? "Create the first workspace. The bootstrap script normally creates one for you." : "You haven't been added to a workspace yet."}
        </EmptyState>
      )}
    </div>
  );
}

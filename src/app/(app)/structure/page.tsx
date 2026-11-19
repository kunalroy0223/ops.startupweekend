import { Archive, ChevronRight, EyeOff, Network, Users, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { ResourceFormButton } from "@/components/structure/resource-forms";
import { AvatarStack } from "@/components/ui/avatar";
import { ArchivedBadge, Badge } from "@/components/ui/badge";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { hasPermission } from "@/domain/authz";
import { listStructure, listWorkspaces, type ScopeSummary } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Workstreams & Teams" };

function Rows({ items, names }: { items: ScopeSummary[]; names: Map<string, string> }) {
  return (
    <Stagger as="ul" className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      {items.map((s) => (
        <StaggerItem as="li" key={s.id}>
          <Link href={`/structure/${s.kind === "team" ? "teams" : "workstreams"}/${s.id}`} className="group grid gap-3 px-4 py-3.5 transition-colors hover:bg-canvas sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-5">
            <span className="hidden size-10 place-items-center rounded-lg border-[1.5px] border-line-strong bg-muted text-fg-2 transition-all duration-300 group-hover:-rotate-6 group-hover:bg-accent group-hover:text-accent-on sm:grid">{s.kind === "team" ? <UsersRound className="size-[18px]" aria-hidden /> : <Network className="size-[18px]" aria-hidden />}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate font-semibold">{s.name}</span>
                {s.status === "archived" ? <ArchivedBadge /> : null}
                {s.myMembership ? <Badge tone={s.myMembership === "lead" ? "accent" : "slate"}>{s.myMembership === "lead" ? "You lead" : "You're in"}</Badge> : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-fg-2">
                {s.linkedIds.length ? `${s.kind === "team" ? "Serves" : "Teams"}: ${s.linkedIds.map((id) => names.get(id)).filter(Boolean).join(", ") || `${s.linkedIds.length} linked`}` : s.description || "No description"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-2 tabular"><Users className="size-3.5 text-fg-3" aria-hidden />{s.memberCount} {s.memberCount === 1 ? "person" : "people"}</span>
            <span className="flex items-center gap-2 text-xs text-fg-3"><span className="sm:hidden">Leads</span><AvatarStack people={s.leads} max={3} /></span>
            <ChevronRight className="hidden size-4 text-fg-3 transition-transform group-hover:translate-x-1 sm:block" aria-hidden />
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export default async function StructurePage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { actor } = await requireActive();
  const showArchived = (await searchParams).archived === "1";
  const canManage = hasPermission(actor, "structure.manage");
  const [{ workstreams, teams }, workspaces] = await Promise.all([listStructure(actor, showArchived && canManage), canManage ? listWorkspaces(actor) : Promise.resolve([])]);
  const names = new Map([...workstreams, ...teams].map((x) => [x.id, x.name]));
  const wsOptions = workspaces.map((w) => ({ id: w.id, name: w.name }));
  const streamOptions = workstreams.filter((w) => w.status === "active").map((w) => ({ id: w.id, name: w.name, workspaceId: w.workspaceId }));
  return (
    <div className="grid gap-10">
      <PageHeader
        icon={<Network />}
        eyebrow="Organisation"
        title="Workstreams & Teams"
        description="Workstreams are the long-running areas of work. Teams are the groups of people who do it. A team can serve more than one workstream."
        actions={
          canManage ? (
            <>
              <ResourceFormButton kind="workstreams" workspaces={wsOptions} variant="secondary" listenToUrl />
              <ResourceFormButton kind="teams" workspaces={wsOptions} workstreams={streamOptions} listenToUrl />
            </>
          ) : null
        }
        meta={canManage ? <Link href={showArchived ? "/structure" : "/structure?archived=1"} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-2 underline underline-offset-4 hover:text-fg">{showArchived ? <EyeOff className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}{showArchived ? "Hide archived" : "Show archived"}</Link> : null}
      />
      <section aria-labelledby="ws">
        <SectionHeading icon={<Network />} id="ws" title="Workstreams" count={workstreams.length} />
        {workstreams.length ? <Rows items={workstreams} names={names} /> : <EmptyState compact icon={<Network />} title="No workstreams yet" action={canManage ? <ResourceFormButton kind="workstreams" workspaces={wsOptions} /> : null}>{canManage ? "Start with the main areas your organisation works on." : "You're not assigned to a workstream yet."}</EmptyState>}
      </section>
      <section id="teams" aria-labelledby="teams-h" className="scroll-mt-24">
        <SectionHeading icon={<UsersRound />} id="teams-h" title="Teams" count={teams.length} />
        {teams.length ? <Rows items={teams} names={names} /> : <EmptyState compact icon={<UsersRound />} title="No teams yet" action={canManage ? <ResourceFormButton kind="teams" workspaces={wsOptions} workstreams={streamOptions} /> : null}>{canManage ? "Create a team, then add a Lead and members." : "You're not in a team yet."}</EmptyState>}
      </section>
    </div>
  );
}

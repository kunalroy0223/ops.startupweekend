import { Link2, Network, Shield, UserPlus, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { ArchivedBadge, Badge, RoleBadge, UserStatusBadge } from "@/components/ui/badge";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { EmptyState, InlineAlert } from "@/components/ui/states";
import type { PublicUser, ScopeDetail } from "@/server/queries";
import { formatDate } from "@/lib/format";
import { ArchiveButton, ResourceFormButton } from "./resource-forms";
import { AddPeopleButton, RemoveFromScope, TeamLinks } from "./roster-controls";

export function ScopeDetailView({ detail, canManage, people, allWorkstreams, tz }: { detail: ScopeDetail; canManage: boolean; people: PublicUser[]; allWorkstreams: { id: string; name: string; workspaceId: string }[]; tz?: string }) {
  const { summary: s, roster, linked } = detail;
  const kind = s.kind === "team" ? "teams" : "workstreams";
  const leads = roster.filter((r) => r.membershipType === "lead");
  const members = roster.filter((r) => r.membershipType === "member");
  const archived = s.status === "archived";

  const list = (entries: typeof roster, empty: string) =>
    entries.length ? (
      <ul className="divide-y divide-line">
        {entries.map((e) => (
          <li key={e.user.uid} className="flex flex-wrap items-center gap-3 py-3">
            <Avatar name={e.user.displayName} seed={e.user.uid} />
            <Link href={`/people/${e.user.uid}`} className="min-w-0 flex-1">
              <span className="block truncate font-semibold hover:underline">{e.user.displayName}</span>
              <span className="block truncate text-xs text-fg-2">{e.user.title || e.user.email}</span>
            </Link>
            <span className="hidden font-mono text-[11px] text-fg-3 sm:block">since {formatDate(e.assignedAt, tz)}</span>
            <RoleBadge role={e.user.role} />
            {e.user.status !== "active" ? <UserStatusBadge status={e.user.status} /> : null}
            {canManage && !archived ? <RemoveFromScope scopeKind={s.kind} scopeId={s.id} scopeName={s.name} uid={e.user.uid} name={e.user.displayName} /> : null}
          </li>
        ))}
      </ul>
    ) : (
      <p className="py-2 text-[13px] text-fg-2">{empty}</p>
    );

  return (
    <div className="grid gap-8">
      <PageHeader
        icon={s.kind === "team" ? <UsersRound /> : <Network />}
        eyebrow={`${s.kind === "team" ? "Team" : "Workstream"} · ${detail.workspaceName}`}
        title={s.name}
        description={s.description || undefined}
        meta={
          <>
            {archived ? <ArchivedBadge /> : null}
            {s.myMembership ? <Badge tone={s.myMembership === "lead" ? "accent" : "slate"}>{s.myMembership === "lead" ? "You lead this" : "You're a member"}</Badge> : null}
            <span className="font-mono text-xs text-fg-3">{roster.length} {roster.length === 1 ? "person" : "people"}</span>
          </>
        }
        actions={
          canManage ? (
            <>
              {!archived ? <AddPeopleButton scopeKind={s.kind} scopeId={s.id} scopeName={s.name} people={people} existing={roster.map((r) => r.user.uid)} /> : null}
              <ResourceFormButton kind={kind} existing={{ id: s.id, name: s.name, description: s.description }} />
              <ArchiveButton kind={kind} id={s.id} name={s.name} archived={archived} />
            </>
          ) : null
        }
      />
      {archived ? <InlineAlert tone="info" title="Archived">Kept for history. Restore it to add people again.</InlineAlert> : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="grid content-start gap-6 lg:col-span-8">
          <Panel>
            <SectionHeading icon={<Shield />} title="Leads" count={leads.length} />
            {list(leads, canManage ? "No Lead yet. Use Add people and choose “Lead”." : "No Lead assigned yet.")}
          </Panel>
          <Panel>
            <SectionHeading icon={<Users />} title="Members" count={members.length} />
            {roster.length ? list(members, "No members yet.") : <EmptyState compact icon={<UserPlus />} title="Nobody here yet" action={canManage && !archived ? <AddPeopleButton scopeKind={s.kind} scopeId={s.id} scopeName={s.name} people={people} existing={[]} /> : null}>Add a Lead and members to get this {s.kind} going.</EmptyState>}
          </Panel>
        </div>
        <aside className="grid content-start gap-6 lg:col-span-4">
          <Panel>
            <SectionHeading icon={<Link2 />} title={s.kind === "team" ? "Serves these workstreams" : "Teams in this workstream"} count={linked.length} />
            {s.kind === "team" && canManage && !archived ? (
              <TeamLinks teamId={s.id} linked={linked} available={allWorkstreams.filter((w) => w.workspaceId === s.workspaceId)} />
            ) : linked.length ? (
              <ul className="divide-y divide-line">
                {linked.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <Link href={`/structure/${s.kind === "team" ? "workstreams" : "teams"}/${l.id}`} className="text-[13px] font-semibold hover:underline">{l.name}</Link>
                    {l.status === "archived" ? <ArchivedBadge /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-2">{s.kind === "team" ? "Not linked to a workstream." : "No teams linked yet. Link teams from the team's page."}</p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

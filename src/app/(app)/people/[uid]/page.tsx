import { History, IdCard } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditProfileButton, MembershipManager, RoleControl, StatusControls } from "@/components/people/person-controls";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge, UserStatusBadge } from "@/components/ui/badge";
import { Panel, SectionHeading } from "@/components/ui/page-header";
import { InlineAlert } from "@/components/ui/states";
import { ActivityTimeline } from "@/components/ui/timeline";
import { hasPermission, isAdmin } from "@/domain/authz";
import { formatDate, relativeTime } from "@/lib/format";
import { getOrganization, getUserDetail, listStructure } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Profile" };

export default async function PersonPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const { actor } = await requireActive();
  const detail = await getUserDetail(actor, uid);
  if (!detail) notFound();
  const { user, memberships, activity } = detail;
  const self = actor.uid === uid;
  const admin = isAdmin(actor);
  const [org, structure] = await Promise.all([getOrganization(), admin ? listStructure(actor) : Promise.resolve({ teams: [], workstreams: [] })]);
  const tz = org?.timezone;
  const canEdit = self || hasPermission(actor, "users.edit");

  return (
    <div className="grid gap-8">
      <header className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-5">
          <Avatar name={user.displayName} seed={user.uid} size="xl" />
          <div className="min-w-0">
            <p className="eyebrow mb-1.5">{self ? "Your profile" : "Profile"}</p>
            <h1 className="display text-[26px] sm:text-[30px]">{user.displayName}</h1>
            <p className="mt-1 text-sm text-fg-2">{user.title ? `${user.title} · ` : ""}{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2"><RoleBadge role={user.role} /><UserStatusBadge status={user.status} /></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? <EditProfileButton uid={uid} self={self} displayName={user.displayName} title={user.title} /> : null}
          {admin && !self ? <RoleControl uid={uid} name={user.displayName} role={user.role} /> : null}
          {admin && !self ? <StatusControls uid={uid} name={user.displayName} status={user.status} /> : null}
        </div>
      </header>

      {admin && self ? <InlineAlert tone="info">Admins can&apos;t change their own role or account status. Another Admin can.</InlineAlert> : null}
      {user.status !== "active" ? <InlineAlert tone="warning" title={`This account is ${user.status}`}>They can&apos;t sign in. Their history and assignments are kept.</InlineAlert> : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <Panel className="lg:col-span-7">
          <MembershipManager
            uid={uid}
            name={user.displayName}
            role={user.role}
            memberships={memberships}
            teams={structure.teams.map((t) => ({ id: t.id, name: t.name }))}
            workstreams={structure.workstreams.map((w) => ({ id: w.id, name: w.name }))}
            canManage={hasPermission(actor, "memberships.manage") && user.status !== "deactivated"}
            tz={tz}
          />
        </Panel>
        <div className="grid content-start gap-6 lg:col-span-5">
          <Panel>
            <SectionHeading icon={<IdCard />} title="Account" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[13px]">
              <dt className="text-fg-2">Joined</dt><dd>{formatDate(user.createdAt, tz)}</dd>
              <dt className="text-fg-2">Last sign-in</dt><dd>{relativeTime(user.lastLoginAt)}</dd>
              <dt className="text-fg-2">User ID</dt><dd className="truncate font-mono text-xs">{user.uid}</dd>
            </dl>
          </Panel>
          {admin || self ? (
            <Panel>
              <SectionHeading icon={<History />} title="Account activity" count={activity.length} />
              {activity.length ? <ActivityTimeline items={activity.slice(0, 12).map((r) => ({ id: r.id, actorName: r.actorUserId === actor.uid ? "You" : r.actorName, action: r.action, createdAt: r.createdAt }))} tz={tz} /> : <p className="text-[13px] text-fg-2">No recorded activity yet.</p>}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

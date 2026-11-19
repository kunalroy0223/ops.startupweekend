import { ArrowUpRight, Bell, ChartPie, Check, CircleAlert, ClipboardList, History, ListTodo, MailPlus, MailWarning, Network, PartyPopper, Rocket, Shield, Siren, UserCheck, UserPlus, Users, UsersRound, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HeadlineReveal } from "@/components/motion/gsap-fx";
import { AvatarStack } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Metric, MetricRow } from "@/components/ui/metric";
import { Panel, SectionHeading } from "@/components/ui/page-header";
import { EmptyState, InlineAlert } from "@/components/ui/states";
import { ActivityTimeline } from "@/components/ui/timeline";
import type { Actor } from "@/domain/authz";
import { ROLE_LABEL } from "@/domain/types";
import { cn } from "@/lib/cn";
import { DEFAULT_TZ, formatDate, greeting, relativeTime } from "@/lib/format";
import { adminOverview, getOrganization, scopedOverview, type ScopeSummary } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Overview" };

function Hero({ actor, tz, sticker }: { actor: Actor; tz: string; sticker: string }) {
  const first = actor.displayName.split(" ")[0] ?? actor.displayName;
  return (
    <section className="dotgrid relative -mx-4 -mt-6 mb-8 border-b border-line px-4 pt-8 pb-8 sm:-mx-6 sm:px-6 lg:-mx-10 lg:-mt-8 lg:px-10 lg:pt-12 lg:pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <p className="eyebrow">{formatDate(new Date().toISOString(), tz, { weekday: "long", day: "numeric", month: "long" })}</p>
        <RoleBadge role={actor.role} />
      </div>
      <HeadlineReveal className="display mt-4 max-w-3xl text-[34px] sm:text-[44px]">
        {greeting(tz)}, <span className="hl">{first}</span>.
      </HeadlineReveal>
      <span className="sticker absolute top-8 right-4 hidden sm:inline-flex lg:right-10 lg:top-12">{sticker}</span>
    </section>
  );
}

export default async function OverviewPage() {
  const { actor } = await requireActive();
  const org = await getOrganization();
  const tz = org?.timezone ?? DEFAULT_TZ;
  if (actor.role === "admin") return <AdminOverviewView actor={actor} tz={tz} />;
  return <ScopedOverviewView actor={actor} tz={tz} />;
}

async function AdminOverviewView({ actor, tz }: { actor: Actor; tz: string }) {
  const o = await adminOverview(actor);
  const setupDone = { workstream: o.workstreams > 0, team: o.teams > 0, people: o.users.total > 1 || o.pendingInvitations > 0 };
  const needsSetup = !setupDone.workstream || !setupDone.team || !setupDone.people;
  const alerts = [
    o.failedEmails ? { icon: MailWarning, tone: "danger" as const, text: `${o.failedEmails} email${o.failedEmails === 1 ? "" : "s"} failed to send`, href: "/settings#delivery" } : null,
    o.failedEvents ? { icon: CircleAlert, tone: "danger" as const, text: `${o.failedEvents} notification event${o.failedEvents === 1 ? "" : "s"} failed`, href: "/settings#delivery" } : null,
    o.users.suspended ? { icon: CircleAlert, tone: "warning" as const, text: `${o.users.suspended} suspended account${o.users.suspended === 1 ? "" : "s"}`, href: "/people?status=suspended" } : null,
    ...o.expiringInvitations.map((i) => ({ icon: MailWarning, tone: "warning" as const, text: `Invitation for ${i.email} ${i.expired ? "has expired" : `expires ${relativeTime(i.expiresAt)}`}`, href: "/people#invitations" })),
    ...o.unassignedActive.map((u) => ({ icon: Users, tone: "info" as const, text: `${u.displayName} (${ROLE_LABEL[u.role]}) isn't in any team`, href: `/people/${u.uid}` })),
  ].filter(Boolean) as { icon: typeof Users; tone: "danger" | "warning" | "info"; text: string; href: string }[];

  const mix = [
    { k: "Admins", n: o.users.admins, cls: "bg-[var(--brand-black)] dark:bg-white" },
    { k: "Leads", n: o.users.leads, cls: "bg-accent" },
    { k: "Team Members", n: o.users.members, cls: "bg-slate" },
  ];
  const mixTotal = Math.max(1, mix.reduce((a, b) => a + b.n, 0));

  return (
    <>
      <Hero actor={actor} tz={tz} sticker="Admin · whole organisation" />
      <MetricRow className="mb-10">
        <Metric icon={<UserCheck />} label="Active people" value={o.users.active} hint={`${o.users.total} accounts in total`} href="/people?status=active" emphasis />
        <Metric icon={<Shield />} label="Leads" value={o.users.leads} href="/people?role=lead" />
        <Metric icon={<Users />} label="Team Members" value={o.users.members} href="/people?role=member" />
        <Metric icon={<Network />} label="Workstreams" value={o.workstreams} href="/structure" />
        <Metric icon={<UsersRound />} label="Teams" value={o.teams} href="/structure#teams" />
        <Metric icon={<MailPlus />} label="Pending invites" value={o.pendingInvitations} href="/people#invitations" />
      </MetricRow>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="grid content-start gap-6 lg:col-span-8">
          {needsSetup ? (
            <Panel className="inked !rounded-[var(--radius-feature)] !p-6" aria-labelledby="setup">
              <p className="eyebrow flex items-center gap-1.5"><Rocket className="size-3.5" aria-hidden />Getting started</p>
              <h2 id="setup" className="display mt-2 text-2xl">
                Set up the <span className="hl">organisation</span>.
              </h2>
              <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: <Network className="size-5" aria-hidden />, done: setupDone.workstream, n: "01", t: "Create a workstream", d: "A long-running area of work, like Partnerships or Operations.", href: "/structure?new=workstream" },
                  { icon: <UsersRound className="size-5" aria-hidden />, done: setupDone.team, n: "02", t: "Create a team", d: "The group of people who do the work. Link it to a workstream.", href: "/structure?new=team" },
                  { icon: <UserPlus className="size-5" aria-hidden />, done: setupDone.people, n: "03", t: "Invite people", d: "Invite Leads and Team Members by email, straight into their teams.", href: "/people?invite=1" },
                ].map((s) => (
                  <li key={s.n}>
                    <Link href={s.href} className={cn("group block h-full rounded-[var(--radius-panel)] border-[1.5px] p-4 transition-colors", s.done ? "border-line bg-muted" : "border-line-strong bg-surface hover:bg-accent-soft")}>
                      <span className="flex items-center justify-between">
                        <span className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-lg border-[1.5px] border-line-strong bg-accent-soft text-accent-text transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">{s.icon}</span><span className="font-mono text-xs text-fg-3">{s.n}</span></span>
                        {s.done ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><Check className="size-3.5" aria-hidden />Done</span>
                        ) : (
                          <ArrowUpRight className="size-4 text-fg-3 group-hover:text-fg" aria-hidden />
                        )}
                      </span>
                      <span className="mt-3 block font-semibold">{s.t}</span>
                      <span className="mt-1 block text-[13px] text-fg-2">{s.d}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}

          <Panel aria-labelledby="attention">
            <SectionHeading icon={<Siren />} id="attention" title="Needs attention" count={alerts.length} />
            {alerts.length ? (
              <ul className="grid divide-y divide-line">
                {alerts.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="group flex items-center gap-3 py-2.5 text-[13px] transition-colors hover:text-fg">
                      <a.icon className={cn("size-4 shrink-0", a.tone === "danger" ? "text-danger" : a.tone === "warning" ? "text-warning" : "text-info")} aria-hidden />
                      <span className="flex-1">{a.text}</span>
                      <ArrowUpRight className="size-4 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-start gap-2 text-[13px] text-fg-2"><PartyPopper className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />Nothing needs you right now. Failed emails, expiring invitations and people without a team show up here.</p>
            )}
          </Panel>

          <Panel aria-labelledby="recent">
            <SectionHeading icon={<History />} id="recent" title="Recent administrative activity" action={<Link href="/activity" className="text-[13px] font-semibold text-fg-2 hover:text-fg">All activity</Link>} />
            {o.recent.length ? <ActivityTimeline items={o.recent.map((r) => ({ id: r.id, actorName: r.actorName, action: r.action, createdAt: r.createdAt }))} tz={tz} /> : <EmptyState compact icon={<History />} title="No activity yet">Changes to people, teams and settings appear here as they happen.</EmptyState>}
          </Panel>
        </div>

        <aside className="grid content-start gap-6 lg:col-span-4">
          <Panel>
            <SectionHeading icon={<Zap />} title="Quick actions" />
            <div className="grid gap-2">
              <LinkButton href="/people?invite=1" variant="primary" icon={<UserPlus className="size-4" />}>Invite a person</LinkButton>
              <LinkButton href="/structure?new=team" variant="secondary" icon={<UsersRound className="size-4" />}>New team</LinkButton>
              <LinkButton href="/structure?new=workstream" variant="secondary" icon={<Network className="size-4" />}>New workstream</LinkButton>
            </div>
          </Panel>
          <Panel aria-labelledby="mix">
            <SectionHeading icon={<ChartPie />} id="mix" title="Role mix" count={o.users.active} />
            <div className="flex h-3 overflow-hidden rounded-full border-[1.5px] border-line-strong" role="img" aria-label={mix.map((m) => `${m.k}: ${m.n}`).join(", ")}>
              {mix.map((m) => (m.n ? <span key={m.k} className={cn("grow-x", m.cls)} style={{ width: `${(m.n / mixTotal) * 100}%` }} /> : null))}
            </div>
            <dl className="mt-4 grid gap-2 text-[13px]">
              {mix.map((m) => (
                <div key={m.k} className="flex items-center gap-2">
                  <span aria-hidden className={cn("size-2.5 rounded-sm border border-line-strong", m.cls)} />
                  <dt className="flex-1 text-fg-2">{m.k}</dt>
                  <dd className="font-mono tabular">{m.n}</dd>
                </div>
              ))}
              <div className="flex items-center gap-2 border-t border-line pt-2">
                <dt className="flex-1 text-fg-2">Suspended / deactivated</dt>
                <dd className="font-mono tabular">{o.users.suspended} / {o.users.deactivated}</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function ScopeList({ items, empty }: { items: ScopeSummary[]; empty: string }) {
  if (!items.length) return <p className="text-[13px] text-fg-2">{empty}</p>;
  return (
    <ul className="grid divide-y divide-line">
      {items.map((s) => (
        <li key={s.id}>
          <Link href={`/structure/${s.kind === "team" ? "teams" : "workstreams"}/${s.id}`} className="group flex items-center gap-4 py-3 hover:text-fg">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-fg-2 transition-colors group-hover:bg-accent-soft group-hover:text-accent-text">{s.kind === "team" ? <UsersRound className="size-4" aria-hidden /> : <Network className="size-4" aria-hidden />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{s.name}</span>
              <span className="text-xs text-fg-2">
                {s.memberCount} {s.memberCount === 1 ? "person" : "people"}
                {s.myMembership ? ` · you're ${s.myMembership === "lead" ? "a Lead" : "a member"}` : ""}
              </span>
            </span>
            <AvatarStack people={s.leads} max={3} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function ScopedOverviewView({ actor, tz }: { actor: Actor; tz: string }) {
  const o = await scopedOverview(actor);
  const isLead = actor.role === "lead";
  const ledStreams = o.structure.workstreams.filter((w) => w.myMembership === "lead");
  const ledTeams = o.structure.teams.filter((t) => t.myMembership === "lead");
  const nothing = !o.structure.teams.length && !o.structure.workstreams.length;
  return (
    <>
      <Hero actor={actor} tz={tz} sticker={isLead ? "Lead · your scope" : "Team Member"} />
      <MetricRow className="mb-10">
        {isLead ? <Metric icon={<Network />} label="Workstreams you lead" value={ledStreams.length} href="/structure" emphasis /> : <Metric icon={<Network />} label="Your workstreams" value={o.structure.workstreams.length} href="/structure" emphasis />}
        {isLead ? <Metric icon={<UsersRound />} label="Teams you lead" value={ledTeams.length} href="/structure#teams" /> : <Metric icon={<UsersRound />} label="Your teams" value={o.structure.teams.length} href="/structure#teams" />}
        <Metric icon={<Users />} label={isLead ? "People in your scope" : "Teammates"} value={o.people} href="/people" />
        <Metric icon={<Bell />} label="Unread notifications" value={o.unread} href="/notifications" />
      </MetricRow>

      {nothing ? (
        <InlineAlert tone="info" title="You're not in a team yet" className="mb-6">
          An Admin will add you to your teams and workstreams. You&apos;ll get a notification when they do.
        </InlineAlert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="grid content-start gap-6 lg:col-span-7">
          <Panel aria-labelledby="teams">
            <SectionHeading icon={<UsersRound />} id="teams" title={isLead ? "Teams in your scope" : "Your teams"} count={o.structure.teams.length} />
            <ScopeList items={o.structure.teams} empty="No teams yet." />
          </Panel>
          <Panel aria-labelledby="streams">
            <SectionHeading icon={<Network />} id="streams" title={isLead ? "Workstreams in your scope" : "Your workstreams"} count={o.structure.workstreams.length} />
            <ScopeList items={o.structure.workstreams} empty="No workstreams yet." />
          </Panel>
        </div>
        <aside className="grid content-start gap-6 lg:col-span-5">
          <Panel aria-labelledby="work">
            <SectionHeading icon={<ListTodo />} id="work" title={isLead ? "Team work" : "Your work"} />
            <EmptyState compact icon={<ClipboardList />} title="No tasks or reports yet">
              Tasks arrive with Module 2 and daily work reports with Module 3. {isLead ? "You'll review your teams' work here." : "Your assigned work will appear here."}
            </EmptyState>
          </Panel>
          <Panel aria-labelledby="mine">
            <SectionHeading icon={<History />} id="mine" title="Your recent activity" action={<Link href="/activity" className="text-[13px] font-semibold text-fg-2 hover:text-fg">All</Link>} />
            {o.recent.length ? <ActivityTimeline items={o.recent.map((r) => ({ id: r.id, actorName: r.actorUserId === actor.uid ? "You" : r.actorName, action: r.action, createdAt: r.createdAt }))} tz={tz} /> : <p className="text-[13px] text-fg-2">Nothing yet.</p>}
          </Panel>
        </aside>
      </div>
    </>
  );
}

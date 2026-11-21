import { ChevronRight, ChevronsLeft, FilterX, MailPlus, SearchX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DirectoryFilters } from "@/components/people/directory-filters";
import { InvitationActions } from "@/components/people/invitation-actions";
import { InviteButton } from "@/components/people/invite-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge, RoleBadge, UserStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { PageHeader, SectionHeading } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { hasPermission, isAdmin } from "@/domain/authz";
import { ROLE_LABEL } from "@/domain/types";
import { userListQuerySchema } from "@/domain/validation";
import { formatDate, relativeTime } from "@/lib/format";
import { emailConfigured } from "@/server/env";
import { getOrganization, listDirectory, listInvitations, listStructure, listWorkspaces } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor } = await requireActive();
  const raw = await searchParams;
  const parsed = userListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : {};
  const admin = isAdmin(actor);
  const [page, invitations, org] = await Promise.all([listDirectory(actor, query), listInvitations(actor), getOrganization()]);
  const tz = org?.timezone;
  const canInvite = hasPermission(actor, "users.invite");
  const [workspaces, structure] = canInvite ? await Promise.all([listWorkspaces(actor), listStructure(actor)]) : [[], { workstreams: [], teams: [] }];
  const filtered = !!(query.q || query.role || query.status);
  const base = new URLSearchParams(Object.entries({ q: query.q, role: query.role, status: query.status }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="grid min-w-0 gap-8">
      <PageHeader
        icon={<Users />}
        eyebrow={admin ? "Organisation directory" : actor.role === "lead" ? "People in your scope" : "Your teammates"}
        title="People"
        description={admin ? "Everyone with an Inhub Workspace account. Invite people, change roles and manage access." : "People who share a team or workstream with you."}
        actions={
          canInvite ? (
            <InviteButton
              emailReady={emailConfigured()}
              workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
              workstreams={structure.workstreams.map((w) => ({ id: w.id, name: w.name, workspaceId: w.workspaceId }))}
              teams={structure.teams.map((t) => ({ id: t.id, name: t.name, workspaceId: t.workspaceId }))}
            />
          ) : null
        }
      />

      <section aria-labelledby="directory" className="grid min-w-0 gap-4">
        <h2 id="directory" className="sr-only">Directory</h2>
        <DirectoryFilters q={query.q} role={query.role} status={query.status} />
        {page.users.length ? (
          <>
            <div className="hidden min-w-0 max-w-full overflow-x-auto md:block"><Table caption="People directory" className="min-w-[680px]">
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Last sign-in</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {page.users.map((u) => (
                  <Tr key={u.uid}>
                    <Td>
                      <Link href={`/people/${u.uid}`} className="flex items-center gap-3 font-semibold hover:underline">
                        <Avatar name={u.displayName} seed={u.uid} />
                        <span className="min-w-0">
                          <span className="block truncate">{u.displayName}{u.uid === actor.uid ? <span className="ml-1.5 font-normal text-fg-3">(you)</span> : null}</span>
                          <span className="block truncate text-xs font-normal text-fg-2">{u.email}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td><RoleBadge role={u.role} /></Td>
                    <Td><UserStatusBadge status={u.status} /></Td>
                    <Td className="text-fg-2">{relativeTime(u.lastLoginAt)}</Td>
                    <Td className="font-mono text-xs text-fg-2">{formatDate(u.createdAt, tz)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table></div>
            <ul className="grid min-w-0 gap-2 md:hidden">
              {page.users.map((u) => (
                <li key={u.uid} className="min-w-0">
                  <Link href={`/people/${u.uid}`} className="group flex min-w-0 w-full items-center gap-3 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-3 transition-transform active:scale-[0.99]">
                    <Avatar name={u.displayName} seed={u.uid} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.displayName}</span>
                      <span className="block min-w-0 truncate text-xs text-fg-2">{u.email}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5"><RoleBadge role={u.role} /><UserStatusBadge status={u.status} /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <nav aria-label="Pagination" className="flex items-center justify-between">
              <span className="font-mono text-xs text-fg-3">{page.users.length} shown{page.nextCursor ? " · more available" : ""}</span>
              <span className="flex gap-2">
                {raw.cursor ? <LinkButton size="sm" icon={<ChevronsLeft className="size-4" />} href={`/people${base.size ? `?${base}` : ""}`}>First page</LinkButton> : null}
                {page.nextCursor ? <LinkButton size="sm" href={`/people?${new URLSearchParams([...base, ["cursor", page.nextCursor]])}`}>Next page<ChevronRight className="size-4" /></LinkButton> : null}
              </span>
            </nav>
          </>
        ) : (
          <EmptyState icon={filtered ? <SearchX /> : <Users />} title={filtered ? "No one matches" : "No people yet"} action={filtered ? <LinkButton href="/people" size="sm" icon={<FilterX className="size-4" />}>Clear filters</LinkButton> : null}>
            {filtered ? "Search matches the start of a name or email. Try fewer letters or remove a filter." : admin ? "Invite your first Lead or Team Member to get started." : "Once you're added to a team, your teammates show up here."}
          </EmptyState>
        )}
      </section>

      {admin ? (
        <section id="invitations" aria-labelledby="inv-heading" className="scroll-mt-24">
          <SectionHeading icon={<MailPlus />} id="inv-heading" title="Pending invitations" count={invitations.length} />
          {invitations.length ? (
            <>
              <div className="hidden min-w-0 max-w-full md:block">
                <Table caption="Pending invitations" className="w-full min-w-0">
                  <thead>
                    <tr>
                      <Th>Email</Th>
                      <Th>Role</Th>
                      <Th>Invited by</Th>
                      <Th>Expires</Th>
                      <Th className="w-12"><span className="sr-only">Actions</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((i) => (
                      <Tr key={i.id}>
                        <Td className="font-semibold">{i.email}</Td>
                        <Td>{ROLE_LABEL[i.intendedRole]}</Td>
                        <Td className="text-fg-2">{i.inviterName} · {relativeTime(i.createdAt)}</Td>
                        <Td>{i.expired ? <Badge tone="danger">Expired</Badge> : <span className="text-fg-2">{relativeTime(i.expiresAt)}</span>}</Td>
                        <Td><InvitationActions id={i.id} email={i.email} /></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <ul className="grid min-w-0 gap-2 md:hidden" aria-label="Pending invitations">
                {invitations.map((i) => (
                  <li key={i.id} className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-sm font-semibold">{i.email}</p>
                        <p className="mt-1 text-xs text-fg-2">{ROLE_LABEL[i.intendedRole]}</p>
                      </div>
                      <div className="shrink-0">
                        <InvitationActions id={i.id} email={i.email} />
                      </div>
                    </div>
                    <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-xs">
                      <div className="min-w-0">
                        <dt className="text-fg-3">Invited by</dt>
                        <dd className="mt-0.5 break-words text-fg-2">{i.inviterName}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-fg-3">Sent</dt>
                        <dd className="mt-0.5 text-fg-2">{relativeTime(i.createdAt)}</dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="text-fg-3">Expires</dt>
                        <dd className="mt-0.5">{i.expired ? <Badge tone="danger">Expired</Badge> : <span className="text-fg-2">{relativeTime(i.expiresAt)}</span>}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[13px] text-fg-2">No invitations waiting. Accepted, revoked and expired invitations are kept in the activity log.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

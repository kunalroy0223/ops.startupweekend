import { Building2, Check, Minus, Send, Settings, ShieldCheck, UserRound, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeliveryActions, OrganizationForm } from "@/components/settings/admin-settings";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { PageHeader, Panel, SectionHeading } from "@/components/ui/page-header";
import { InlineAlert } from "@/components/ui/states";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { isAdmin } from "@/domain/authz";
import { relativeTime } from "@/lib/format";
import { emailConfigured, serverEnv } from "@/server/env";
import { deliveryHealth, getOrganization } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

type Cell = "yes" | "no" | string;
const ACCESS: [string, Cell, Cell, Cell][] = [
  ["Invite people, change roles, suspend accounts", "yes", "no", "no"],
  ["Create workstreams and teams", "yes", "no", "no"],
  ["Add or remove people from teams", "yes", "no", "no"],
  ["See people", "Everyone", "Their teams & workstreams", "Their teammates"],
  ["See workstreams and teams", "All", "Assigned", "Assigned"],
  ["Lead teams and review reports (Modules 2–3)", "All", "Assigned", "no"],
  ["See the activity log", "Everything", "Their own", "Their own"],
  ["Change organisation settings", "yes", "no", "no"],
];

function AccessCell({ v }: { v: Cell }) {
  if (v === "yes") return <span className="inline-flex items-center gap-1 font-semibold text-success"><Check className="size-4" aria-hidden />Yes</span>;
  if (v === "no") return <span className="inline-flex items-center gap-1 text-fg-3"><X className="size-4" aria-hidden />No</span>;
  return <span>{v}</span>;
}

export default async function SettingsPage() {
  const { actor } = await requireActive();
  const admin = isAdmin(actor);
  const [org, health] = await Promise.all([getOrganization(), deliveryHealth(actor)]);
  const env = serverEnv();
  const email = emailConfigured(env);
  return (
    <div className="grid gap-8">
      <PageHeader icon={<Settings />} eyebrow={admin ? "Admin" : "You"} title="Settings" description={admin ? "Your account, the organisation, email delivery and who can do what." : "Your account and notifications."} />

      <Panel>
        <SectionHeading icon={<UserRound />} title="Your account" />
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/people/${actor.uid}`}>Edit your profile</LinkButton>
          <LinkButton href="/notifications/preferences">Notification preferences</LinkButton>
          <LinkButton href="/forgot-password">Change password</LinkButton>
        </div>
        <p className="mt-3 text-xs text-fg-2">Changing your password sends a secure link to {actor.email}.</p>
      </Panel>

      {admin ? (
        <>
          <Panel>
            <SectionHeading icon={<Building2 />} title="Organisation" />
            {org ? <OrganizationForm name={org.name} timezone={org.timezone} /> : <InlineAlert tone="warning">The organisation record is missing. Run <code className="font-mono">npm run bootstrap</code>.</InlineAlert>}
          </Panel>

          <Panel>
            <section id="delivery" aria-labelledby="delivery-h" className="scroll-mt-24">
              <SectionHeading icon={<Send />} id="delivery-h" title="Email delivery" action={health ? <DeliveryActions failed={health.failed} /> : null} />
              <dl className="mb-5 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr]">
                <dt className="text-fg-2">Provider</dt>
                <dd>{email ? <Badge tone="success" icon={<Check />}>Resend configured</Badge> : <Badge tone="warning" icon={<Minus />}>Not configured: emails are recorded as failed</Badge>}</dd>
                <dt className="text-fg-2">Sender</dt>
                <dd className="font-mono text-xs">{env.EMAIL_FROM}</dd>
                <dt className="text-fg-2">Delivery webhooks</dt>
                <dd>{env.RESEND_WEBHOOK_SECRET ? "Signed webhooks enabled" : "Not configured (delivered/bounced status won't update)"}</dd>
              </dl>
              {!email ? (
                <InlineAlert tone="info" className="mb-5" title="Emails aren't going out yet">
                  Add <code className="font-mono">RESEND_API_KEY</code> and verify startupweekend.sbs in Resend (SPF and DKIM), then use “Retry failed emails”. Until then, copy invitation links from People.
                </InlineAlert>
              ) : null}
              {health ? (
                <>
                  <div className="grid grid-cols-3 gap-4 border-y border-line py-4 sm:grid-cols-6">
                    {([["Waiting", health.pending], ["Sent (7d)", health.sent], ["Delivered (7d)", health.delivered], ["Bounced", health.bounced], ["Failed", health.failed], ["Events queued", health.pendingEvents]] as const).map(([l, v]) => (
                      <div key={l}><p className="eyebrow">{l}</p><p className="display tabular mt-1 text-2xl">{v}</p></div>
                    ))}
                  </div>
                  {health.recentFailures.length ? (
                    <Table caption="Recent failed emails" className="mt-5">
                      <thead><tr><Th>Recipient</Th><Th>Event</Th><Th>Reason</Th><Th>When</Th></tr></thead>
                      <tbody>
                        {health.recentFailures.map((f) => (
                          <Tr key={f.id}><Td>{f.recipientEmail}</Td><Td className="font-mono text-xs">{f.eventType}</Td><Td className="font-mono text-xs text-danger">{f.lastErrorCode}</Td><Td className="text-fg-2">{relativeTime(f.updatedAt)}</Td></Tr>
                        ))}
                      </tbody>
                    </Table>
                  ) : null}
                </>
              ) : null}
            </section>
          </Panel>

          <Panel>
            <SectionHeading icon={<ShieldCheck />} title="Who can do what" />
            <p className="mb-4 text-[13px] text-fg-2">Every rule is enforced by the server and the database, not just hidden in the interface. Full detail in <code className="font-mono">docs/rbac-matrix.md</code>.</p>
            <Table caption="Role access overview">
              <thead><tr><Th>Action</Th><Th>Admin</Th><Th>Lead</Th><Th>Team Member</Th></tr></thead>
              <tbody>
                {ACCESS.map(([a, ...cells]) => (
                  <Tr key={a}><Td className="font-medium">{a}</Td>{cells.map((c, i) => <Td key={i}><AccessCell v={c} /></Td>)}</Tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-3 text-xs text-fg-2">Change someone&apos;s role from their <Link href="/people" className="underline">profile</Link>.</p>
          </Panel>
        </>
      ) : null}
    </div>
  );
}

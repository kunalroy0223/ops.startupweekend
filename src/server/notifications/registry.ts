import "server-only";
import type { EventType } from "@/domain/events";
import { ROLE_LABEL, USER_STATUS_LABEL, type DomainEvent, type Invitation, type Role, type UserProfile, type UserStatus } from "@/domain/types";
import { col, fromDoc } from "../db";
import { appUrl } from "../env";
import { unseal } from "../tokens";
import type { NoticeContent } from "../email/render";

/**
 * A resolved recipient. `uid` is absent only for people without an account
 * yet (invitees), who can receive email but never in-app notifications.
 */
export interface Recipient {
  key: string;
  uid?: string;
  email: string;
  /** Restricts channels below the catalogue default for this recipient. */
  only?: { inApp?: boolean; email?: boolean };
  /** Deactivated/suspended users may still receive essential account email. */
  allowInactive?: boolean;
  inApp: { title: string; body: string; actionUrl?: string; resourceType?: string; resourceId?: string };
  /** Built lazily at send time so secrets are only decrypted when needed. */
  compose: () => Promise<NoticeContent & { subject: string; templateId: string }>;
}

export interface EventHandler {
  resolve(event: DomainEvent): Promise<Recipient[]>;
}

async function getUser(uid: unknown): Promise<UserProfile | null> {
  if (typeof uid !== "string" || !uid) return null;
  const snap = await col("users").doc(uid).get();
  return snap.exists ? fromDoc<UserProfile>(snap, "uid") : null;
}

async function getName(collection: "teams" | "workstreams", id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !id) return null;
  const snap = await col(collection).doc(id).get();
  return snap.exists ? String(snap.data()?.name ?? "") : null;
}

/** Active Leads of a team or workstream, re-validated against current membership and account status. */
async function activeLeadsOf(kind: "team" | "workstream", scopeId: string): Promise<UserProfile[]> {
  const snap = await col(kind === "team" ? "teamMemberships" : "workstreamMemberships")
    .where(kind === "team" ? "teamId" : "workstreamId", "==", scopeId)
    .where("status", "==", "active")
    .where("membershipType", "==", "lead")
    .get();
  const users = await Promise.all(snap.docs.map((d) => getUser(d.data().userId)));
  return users.filter((u): u is UserProfile => !!u && u.status === "active" && u.role !== "member");
}

const signInUrl = () => appUrl("/login");

function invitationHandler(resent: boolean): EventHandler {
  return {
    async resolve(event) {
      const snap = await col("invitations").doc(String(event.payload.invitationId)).get();
      if (!snap.exists) return [];
      const inv = fromDoc<Invitation & { tokenCiphertext?: string }>(snap);
      // Skip if the invitation was accepted, revoked, superseded or expired before delivery.
      if (inv.status !== "pending" || !inv.tokenCiphertext || Date.parse(inv.expiresAt) < Date.now()) return [];
      if (String(event.payload.tokenVersion ?? "") !== String((snap.data()?.tokenVersion as number | undefined) ?? "")) return [];
      const inviter = await getUser(inv.invitedBy);
      const sealed = inv.tokenCiphertext;
      const expires = new Date(inv.expiresAt).toUTCString().replace(" GMT", " UTC");
      return [
        {
          key: `email:${inv.emailNormalized}`,
          email: inv.email,
          only: { inApp: false },
          inApp: { title: "", body: "" },
          compose: async () => ({
            templateId: resent ? "invitation_resent" : "invitation",
            subject: resent ? "Your new Inhub Workspace invitation link" : "You're invited to Inhub Workspace",
            preview: `${inviter?.displayName ?? "An Admin"} invited you to join Inhub Workspace as ${ROLE_LABEL[inv.intendedRole]}.`,
            eyebrow: resent ? "Invitation · new link" : "Invitation",
            heading: "Your workspace is ready for you.",
            paragraphs: [
              `${inviter?.displayName ?? "An Inhub Admin"} has invited you to Inhub Workspace as a ${ROLE_LABEL[inv.intendedRole]}.`,
              "Use the button below to choose your name and password. The link works once and only for this email address.",
              ...(resent ? ["Any earlier invitation link you received no longer works."] : []),
            ],
            cta: { label: "Accept invitation", href: appUrl(`/invite/${unseal(sealed)}`) },
            footnote: `This link expires ${expires}. If you weren't expecting this, you can ignore it.`,
          }),
        },
      ];
    },
  };
}

const handlers: Record<EventType, EventHandler> = {
  USER_INVITED: invitationHandler(false),
  INVITATION_RESENT: invitationHandler(true),

  ACCOUNT_ACTIVATED: {
    async resolve(event) {
      const user = await getUser(event.payload.userId);
      if (!user) return [];
      const out: Recipient[] = [
        {
          key: user.uid,
          uid: user.uid,
          email: user.email,
          inApp: { title: "Welcome to Inhub Workspace", body: "Your account is active. Your teams and workstreams are on your overview.", actionUrl: "/overview" },
          compose: async () => ({
            templateId: "account_activated",
            subject: "Your Inhub Workspace account is active",
            preview: "Your account is active.",
            eyebrow: "Account",
            heading: `Welcome, ${user.displayName}.`,
            paragraphs: ["Your Inhub Workspace account is now active. Sign in any time with this email address and the password you chose."],
            cta: { label: "Open Inhub Workspace", href: signInUrl() },
          }),
        },
      ];
      const inviter = await getUser(event.payload.invitedBy);
      if (inviter && inviter.uid !== user.uid) {
        out.push({
          key: inviter.uid,
          uid: inviter.uid,
          email: inviter.email,
          only: { email: false },
          inApp: { title: `${user.displayName} joined`, body: `${user.email} accepted your invitation.`, actionUrl: `/people/${user.uid}`, resourceType: "user", resourceId: user.uid },
          compose: async () => {
            throw new Error("not used");
          },
        });
      }
      return out;
    },
  },

  USER_ROLE_CHANGED: {
    async resolve(event) {
      const user = await getUser(event.payload.userId);
      if (!user) return [];
      const to = ROLE_LABEL[event.payload.to as Role] ?? String(event.payload.to);
      const from = ROLE_LABEL[event.payload.from as Role] ?? String(event.payload.from);
      return [
        {
          key: user.uid,
          uid: user.uid,
          email: user.email,
          inApp: { title: `Your role is now ${to}`, body: `An Admin changed your role from ${from} to ${to}.`, actionUrl: "/overview" },
          compose: async () => ({
            templateId: "role_changed",
            subject: `Your Inhub Workspace role is now ${to}`,
            preview: `Your role changed from ${from} to ${to}.`,
            eyebrow: "Access",
            heading: `You're now ${to === "Admin" ? "an" : "a"} ${to}.`,
            paragraphs: [`An Admin changed your platform role from ${from} to ${to}. What you can see and do has been updated.`],
            cta: { label: "Open Inhub Workspace", href: signInUrl() },
          }),
        },
      ];
    },
  },

  ACCOUNT_STATUS_CHANGED: {
    async resolve(event) {
      const user = await getUser(event.payload.userId);
      if (!user) return [];
      const to = event.payload.to as UserStatus;
      const label = USER_STATUS_LABEL[to] ?? String(to);
      const reactivated = to === "active";
      return [
        {
          key: user.uid,
          uid: user.uid,
          email: user.email,
          allowInactive: true,
          inApp: { title: `Account ${label.toLowerCase()}`, body: reactivated ? "Your account was reactivated." : `Your account was ${label.toLowerCase()} by an Admin.` },
          compose: async () => ({
            templateId: "account_status_changed",
            subject: reactivated ? "Your Inhub Workspace account is active again" : `Your Inhub Workspace account was ${label.toLowerCase()}`,
            preview: `Account status: ${label}.`,
            eyebrow: "Account",
            heading: reactivated ? "You're back in." : `Your account was ${label.toLowerCase()}.`,
            paragraphs: reactivated
              ? ["An Admin reactivated your account. You can sign in again with your existing password."]
              : ["An Admin changed your account status, and you can no longer sign in. Your past work and records are kept.", "If you think this is a mistake, contact your Inhub Admin."],
            cta: reactivated ? { label: "Sign in", href: signInUrl() } : undefined,
          }),
        },
      ];
    },
  },

  USER_TEAM_ASSIGNED: assignmentHandler("team"),
  USER_WORKSTREAM_ASSIGNED: assignmentHandler("workstream"),
};

function assignmentHandler(kind: "team" | "workstream"): EventHandler {
  const noun = kind === "team" ? "team" : "workstream";
  return {
    async resolve(event) {
      const user = await getUser(event.payload.userId);
      const scopeId = String(event.payload.scopeId);
      const scopeName = await getName(kind === "team" ? "teams" : "workstreams", scopeId);
      if (!user || !scopeName) return [];
      const change = String(event.payload.change); // added | removed | transferred
      const fromId = event.payload.fromScopeId ? String(event.payload.fromScopeId) : undefined;
      const fromName = fromId ? await getName("teams", fromId) : null;
      const asLead = event.payload.membershipType === "lead";
      const link = `/structure/${kind === "team" ? "teams" : "workstreams"}/${scopeId}`;

      const selfLine =
        change === "removed"
          ? `You were removed from the ${scopeName} ${noun}.`
          : change === "transferred"
            ? `You moved from ${fromName ?? "another team"} to ${scopeName}.`
            : `You were added to the ${scopeName} ${noun}${asLead ? " as a Lead" : ""}.`;

      const out: Recipient[] = [
        {
          key: user.uid,
          uid: user.uid,
          email: user.email,
          inApp: { title: change === "removed" ? `Removed from ${scopeName}` : `Added to ${scopeName}`, body: selfLine, actionUrl: change === "removed" ? "/overview" : link, resourceType: kind, resourceId: scopeId },
          compose: async () => ({
            templateId: `${kind}_assignment`,
            subject: change === "removed" ? `You left ${scopeName}` : `You're in ${scopeName}`,
            preview: selfLine,
            eyebrow: kind === "team" ? "Team" : "Workstream",
            heading: change === "removed" ? `You left ${scopeName}.` : `Welcome to ${scopeName}.`,
            paragraphs: [selfLine],
            cta: change === "removed" ? undefined : { label: `Open ${scopeName}`, href: appUrl(link) },
          }),
        },
      ];

      // Relevant Leads (permission-aware: only Leads currently assigned to the affected scope).
      const scopes = [scopeId, ...(fromId ? [fromId] : [])];
      const seen = new Set([user.uid, event.actorUserId ?? ""]);
      for (const s of scopes) {
        for (const lead of await activeLeadsOf(kind, s)) {
          if (seen.has(lead.uid)) continue;
          seen.add(lead.uid);
          const line =
            change === "removed"
              ? `${user.displayName} left ${scopeName}.`
              : change === "transferred"
                ? `${user.displayName} moved from ${fromName ?? "another team"} to ${scopeName}.`
                : `${user.displayName} joined ${scopeName}${asLead ? " as a Lead" : ""}.`;
          out.push({
            key: lead.uid,
            uid: lead.uid,
            email: lead.email,
            inApp: { title: `${noun[0]!.toUpperCase()}${noun.slice(1)} update`, body: line, actionUrl: link, resourceType: kind, resourceId: scopeId },
            compose: async () => ({
              templateId: `${kind}_assignment_lead`,
              subject: line,
              preview: line,
              eyebrow: `${noun} you lead`,
              heading: line,
              paragraphs: [`You're receiving this because you lead ${scopeName}.`],
              cta: { label: `Open ${scopeName}`, href: appUrl(link) },
            }),
          });
        }
      }
      return out;
    },
  };
}

export function handlerFor(type: string): EventHandler | null {
  return (handlers as Record<string, EventHandler>)[type] ?? null;
}

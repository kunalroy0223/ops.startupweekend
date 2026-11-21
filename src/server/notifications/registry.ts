import "server-only";
import type { EventType } from "@/domain/events";
import { ROLE_LABEL, USER_STATUS_LABEL, type DomainEvent, type Invitation, type Role, type UserProfile, type UserStatus } from "@/domain/types";
import { col, fromDoc } from "../db";
import { appUrl, serverEnv } from "../env";
import { unseal } from "../tokens";
import type { NoticeContent } from "../email/render";
import type { Task } from "@/domain/types";
import { canAccessTask } from "../services/tasks";

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
  if (!snap.exists) return null;
  const user = fromDoc<UserProfile>(snap, "uid");
  return user.organizationId === serverEnv().ORGANIZATION_ID ? user : null;
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

function taskReminderHandler(kind: "due_soon" | "overdue"): EventHandler {
  const eventTitle = kind === "due_soon" ? "Task due soon" : "Task overdue";
  return {
    async resolve(event) {
      const taskId = String(event.payload.taskId ?? event.resourceId);
      const userId = String(event.payload.userId ?? "");
      const dueAt = String(event.payload.dueAt ?? "");
      const taskSnap = await col("tasks").doc(taskId).get();
      if (!taskSnap.exists) return [];
      const task = fromDoc<Task>(taskSnap);
      if (task.organizationId !== serverEnv().ORGANIZATION_ID || task.accountableUserId !== userId || task.dueAt !== dueAt) return [];
      if (task.archivedAt || !["backlog", "assigned", "in_progress", "blocked"].includes(task.status)) return [];
      const dueMs = Date.parse(dueAt);
      if (!Number.isFinite(dueMs) || (kind === "due_soon" ? dueMs <= Date.now() : dueMs > Date.now())) return [];
      const user = await getUser(userId);
      if (!user || user.status !== "active") return [];
      const organizationSnap = await col("organizations").doc(serverEnv().ORGANIZATION_ID).get();
      const configuredTimeZone = String(organizationSnap.data()?.timezone ?? "Asia/Kolkata");
      let timeZone = "Asia/Kolkata";
      try {
        new Intl.DateTimeFormat("en-IN", { timeZone: configuredTimeZone }).format(new Date(dueMs));
        timeZone = configuredTimeZone;
      } catch {
        // Fall back to the organisation's documented default if its setting is invalid.
      }
      const dueLabel = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(dueMs));
      const link = `/tasks/${encodeURIComponent(taskId)}`;
      const body = kind === "due_soon" ? `Due ${dueLabel}. Review the remaining work and update the task.` : `This task was due ${dueLabel} and is still open.`;
      return [{
        key: user.uid,
        uid: user.uid,
        email: user.email,
        inApp: { title: eventTitle, body: `${task.title} · ${body}`, actionUrl: link, resourceType: "task", resourceId: taskId },
        compose: async () => ({
          templateId: kind === "due_soon" ? "task_due_soon" : "task_overdue",
          subject: kind === "due_soon" ? `Coming up: ${task.title}` : `Overdue: ${task.title}`,
          preview: body,
          eyebrow: "Task reminder",
          heading: kind === "due_soon" ? "A task deadline is approaching." : "A task is overdue.",
          paragraphs: [`${task.title} is assigned to you. ${body}`],
          cta: { label: "Open task", href: appUrl(link) },
        }),
      }];
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

  TASK_ASSIGNED: {
    async resolve(event) {
      const taskId = String(event.payload.taskId ?? event.resourceId);
      const title = String(event.payload.title ?? "A task");
      const link = `/tasks/${encodeURIComponent(taskId)}`;
      const newOwner = await getUser(event.payload.userId);
      const previousUserId = typeof event.payload.previousUserId === "string" ? event.payload.previousUserId : "";
      const isReassignment = !!previousUserId && previousUserId !== String(event.payload.userId);
      const recipients = new Map<string, Recipient>();

      if (newOwner && newOwner.status === "active") {
        recipients.set(newOwner.uid, {
          key: newOwner.uid, uid: newOwner.uid, email: newOwner.email,
          inApp: { title: isReassignment ? "Task assigned to you" : "New task assigned", body: title, actionUrl: link, resourceType: "task", resourceId: taskId },
          compose: async () => ({
            templateId: "task_assigned", subject: `You've been assigned: ${title}`,
            preview: `A task has been assigned to you: ${title}.`, eyebrow: "Task assignment",
            heading: "A new task is yours to own.",
            paragraphs: [`${title} has been assigned to you as the accountable owner. Open Inhub Workspace to review the details, due date and acceptance criteria.`],
            cta: { label: "View task", href: appUrl(link) },
          }),
        });
      }

      if (isReassignment) {
        const prior = await getUser(previousUserId);
        if (prior && prior.status === "active" && prior.uid !== event.actorUserId) {
          recipients.set(prior.uid, {
            key: prior.uid, uid: prior.uid, email: prior.email, only: { email: false },
            inApp: { title: "Task reassigned", body: `You are no longer the accountable owner of ${title}.`, actionUrl: "/tasks", resourceType: "task", resourceId: taskId },
            compose: async () => { throw new Error("Email is disabled for prior task owners."); },
          });
        }

      }

      const scopes = [
        ...(typeof event.payload.teamId === "string" && event.payload.teamId ? [{ kind: "team" as const, id: event.payload.teamId }] : []),
        ...(typeof event.payload.workstreamId === "string" && event.payload.workstreamId ? [{ kind: "workstream" as const, id: event.payload.workstreamId }] : []),
      ];
      for (const scope of scopes) {
        for (const lead of await activeLeadsOf(scope.kind, scope.id)) {
          if (lead.uid === event.actorUserId || recipients.has(lead.uid)) continue;
          recipients.set(lead.uid, {
            key: lead.uid, uid: lead.uid, email: lead.email, only: { email: false },
            inApp: { title: isReassignment ? "Task reassigned in your scope" : "Task assigned in your scope", body: isReassignment ? `${title} has a new accountable owner.` : `${title} was assigned within your scope.`, actionUrl: link, resourceType: "task", resourceId: taskId },
            compose: async () => { throw new Error("Email is disabled for task assignment activity."); },
          });
        }
      }
      return [...recipients.values()];
    },
  },
  TASK_STATUS_CHANGED: {
    async resolve(event) {
      const taskId = String(event.payload.taskId ?? event.resourceId);
      const taskSnap = await col("tasks").doc(taskId).get();
      if (!taskSnap.exists) return [];
      const task = fromDoc<Task>(taskSnap);
      const title = String(event.payload.title ?? task.title ?? "A task");
      const status = String(event.payload.status ?? "updated").replaceAll("_", " ");
      const ids = new Set<string>([
        ...(Array.isArray(event.payload.userIds) ? event.payload.userIds.filter((x): x is string => typeof x === "string") : []),
        task.accountableUserId,
        ...task.collaboratorUserIds,
      ]);
      if (task.teamId) {
        const memberships = await col("teamMemberships").where("teamId", "==", task.teamId).where("status", "==", "active").get();
        for (const membership of memberships.docs) if (typeof membership.data().userId === "string") ids.add(membership.data().userId);
        for (const lead of await activeLeadsOf("team", task.teamId)) ids.add(lead.uid);
      }
      if (task.workstreamId) {
        for (const lead of await activeLeadsOf("workstream", task.workstreamId)) ids.add(lead.uid);
      }
      const recipients: Recipient[] = [];
      for (const uid of ids) {
        if (!uid || uid === event.actorUserId) continue;
        const user = await getUser(uid);
        if (!user || user.status !== "active" || !await canAccessTask(user, task)) continue;
        recipients.push({
          key: user.uid, uid: user.uid, email: user.email, only: { email: false },
          inApp: { title: "Task status updated", body: `${title} is now ${status}.`, actionUrl: `/tasks/${encodeURIComponent(taskId)}`, resourceType: "task", resourceId: taskId },
          compose: async () => { throw new Error("Email is disabled for task status updates."); },
        });
      }
      return recipients;
    },
  },
  TASK_COMMENTED: {
    async resolve(event) {
      const taskId = String(event.payload.taskId ?? event.resourceId);
      const taskSnap = await col("tasks").doc(taskId).get();
      if (!taskSnap.exists) return [];
      const task = fromDoc<Task>(taskSnap);
      const title = String(event.payload.title ?? task.title ?? "A task");
      const author = await getUser(event.actorUserId);
      const preview = String(event.payload.preview ?? "A new comment was added.").slice(0, 180);
      const ids = new Set<string>(Array.isArray(event.payload.userIds) ? event.payload.userIds.filter((x): x is string => typeof x === "string") : []);
      const mentioned = new Set<string>(Array.isArray(event.payload.mentionedUserIds) ? event.payload.mentionedUserIds.filter((x): x is string => typeof x === "string") : []);
      for (const uid of mentioned) ids.add(uid);
      ids.add(task.accountableUserId);
      for (const uid of task.collaboratorUserIds ?? []) ids.add(uid);
      if (task.teamId) {
        const memberships = await col("teamMemberships").where("teamId", "==", task.teamId).where("status", "==", "active").get();
        for (const membership of memberships.docs) if (typeof membership.data().userId === "string") ids.add(membership.data().userId);
        for (const lead of await activeLeadsOf("team", task.teamId)) ids.add(lead.uid);
      }
      if (task.workstreamId) for (const lead of await activeLeadsOf("workstream", task.workstreamId)) ids.add(lead.uid);

      const link = `/tasks/${encodeURIComponent(taskId)}`;
      const out: Recipient[] = [];
      for (const uid of ids) {
        if (!uid || uid === event.actorUserId) continue;
        const user = await getUser(uid);
        if (!user || user.status !== "active" || !await canAccessTask(user, task)) continue;
        const isMention = mentioned.has(uid);
        out.push({
          key: user.uid, uid: user.uid, email: user.email,
          ...(isMention ? {} : { only: { email: false } }),
          inApp: {
            title: isMention ? "You were mentioned in a task" : "New comment on a task",
            body: isMention ? `${author?.displayName ?? "A teammate"} mentioned you in ${title}.` : `${author?.displayName ?? "A teammate"} commented on ${title}.`,
            actionUrl: link, resourceType: "task", resourceId: taskId,
          },
          compose: async () => isMention ? ({
            templateId: "task_mention", subject: `You were mentioned in ${title}`, preview,
            eyebrow: "Task mention", heading: "You were mentioned in a task comment.",
            paragraphs: [`${author?.displayName ?? "A teammate"} mentioned you in ${title}.`, preview],
            cta: { label: "Open task", href: appUrl(link) },
          }) : { templateId: "task_comment", subject: `New comment on ${title}`, preview, eyebrow: "Task update", heading: "A new comment was added.", paragraphs: [preview], cta: { label: "Open task", href: appUrl(link) } },
        });
      }
      return out;
    },
  },
  WORK_REPORT_SUBMITTED: {
    async resolve(event) {
      const reportId = String(event.payload.reportId ?? event.resourceId);
      const teamId = typeof event.payload.teamId === "string" ? event.payload.teamId : "";
      const workstreamId = typeof event.payload.workstreamId === "string" ? event.payload.workstreamId : "";
      const leads = [
        ...(teamId ? await activeLeadsOf("team", teamId) : []),
        ...(workstreamId ? await activeLeadsOf("workstream", workstreamId) : []),
      ];
      const recipients = new Map(leads.filter(u => u.uid !== event.actorUserId).map(u => [u.uid, u]));
      if (!recipients.size) {
        const admins = await col("users").where("organizationId", "==", String(event.organizationId)).where("role", "==", "admin").where("status", "==", "active").get();
        for (const d of admins.docs) {
          const user = fromDoc<UserProfile>(d, "uid");
          if (user.uid !== event.actorUserId) recipients.set(user.uid, user);
        }
      }
      const date = String(event.payload.reportDate ?? "");
      return [...recipients.values()].map(user => ({
        key: user.uid, uid: user.uid, email: user.email,
        inApp: { title: "Work report submitted", body: `${date} report is ready for review.`, actionUrl: `/reports/${encodeURIComponent(reportId)}`, resourceType: "workReport", resourceId: reportId },
        compose: async () => ({ templateId: "work_report_submitted", subject: `Work report submitted · ${date}`, preview: `${user.displayName}, a work report is waiting for your review.`, eyebrow: "Work report review", heading: "A report is ready for review.", paragraphs: [`A team member submitted their work report for ${date}. Review the reported work, time, blockers and next steps in Inhub Workspace.`], cta: { label: "Review report", href: appUrl(`/reports/${encodeURIComponent(reportId)}`) } }),
      }));
    },
  },
  WORK_REPORT_APPROVED: {
    async resolve(event) {
      const user = await getUser(event.payload.userId);
      if (!user || user.status !== "active") return [];
      const reportId = String(event.payload.reportId ?? event.resourceId);
      const date = String(event.payload.reportDate ?? "");
      return [{ key: user.uid, uid: user.uid, email: user.email,
        inApp: { title: "Work report approved", body: `Your report for ${date} was approved.`, actionUrl: `/reports/${encodeURIComponent(reportId)}`, resourceType: "workReport", resourceId: reportId },
        compose: async () => ({ templateId: "work_report_approved", subject: `Your work report was approved · ${date}`, preview: `Your report for ${date} was approved.`, eyebrow: "Work report", heading: "Your report was approved.", paragraphs: [`Your work report for ${date} has been approved by your reviewer.`], cta: { label: "View report", href: appUrl(`/reports/${encodeURIComponent(reportId)}`) } }),
      }];
    },
  },
  WORK_REPORT_NEEDS_REVISION: {
    async resolve(event) {
      const user = await getUser(event.payload.userId);
      if (!user || user.status !== "active") return [];
      const reportId = String(event.payload.reportId ?? event.resourceId);
      const date = String(event.payload.reportDate ?? "");
      return [{ key: user.uid, uid: user.uid, email: user.email,
        inApp: { title: "Work report needs revision", body: `Your report for ${date} was returned with feedback.`, actionUrl: `/reports/${encodeURIComponent(reportId)}`, resourceType: "workReport", resourceId: reportId },
        compose: async () => ({ templateId: "work_report_revision", subject: `Please revise your work report · ${date}`, preview: `Your report for ${date} needs an update.`, eyebrow: "Work report", heading: "Your reviewer requested a revision.", paragraphs: [`Your work report for ${date} was returned with feedback. Open the report to read the review comment and make the requested changes.`], cta: { label: "Update report", href: appUrl(`/reports/${encodeURIComponent(reportId)}`) } }),
      }];
    },
  },
  USER_TEAM_ASSIGNED: assignmentHandler("team"),
  USER_WORKSTREAM_ASSIGNED: assignmentHandler("workstream"),
  TASK_DUE_SOON: taskReminderHandler("due_soon"),
  TASK_OVERDUE: taskReminderHandler("overdue"),
  CRM_FOLLOW_UP_DUE: crmReminderHandler("follow_up"),
  CRM_REPLY_WAITING: crmReminderHandler("reply_waiting"),
};


function crmReminderHandler(kind: "follow_up" | "reply_waiting"): EventHandler {
  return {
    async resolve(event) {
      const memberId = String(event.payload.campaignMemberId ?? event.resourceId);
      const memberSnap = await col("crmCampaignMembers").doc(memberId).get();
      if (!memberSnap.exists) return [];
      const member = memberSnap.data()!;
      if (member.organizationId !== serverEnv().ORGANIZATION_ID || member.assignedToUserId !== event.payload.userId) return [];
      const toMillis = (value: unknown): number => {
        if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
          return (value as { toMillis: () => number }).toMillis();
        }
        if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
          return (value as { toDate: () => Date }).toDate().getTime();
        }
        return Date.parse(String(value ?? ""));
      };
      const nowMs = Date.now();
      if (kind === "follow_up" && (!member.nextFollowUpAt || ["converted", "not_interested", "do_not_contact"].includes(String(member.stage)) || toMillis(member.nextFollowUpAt) > nowMs)) return [];
      if (kind === "reply_waiting") {
        const waitHours = Number(event.payload.waitHours);
        const lastInteractionMs = toMillis(member.lastInteractionAt);
        if (member.stage !== "replied" || !Number.isFinite(waitHours) || waitHours < 1 || !Number.isFinite(lastInteractionMs) || lastInteractionMs > nowMs - waitHours * 60 * 60_000) return [];
      }
      const [user, campaignSnap, contactSnap] = await Promise.all([
        getUser(member.assignedToUserId),
        col("crmCampaigns").doc(String(member.campaignId)).get(),
        col("crmContacts").doc(String(member.contactId)).get(),
      ]);
      if (!user || user.status !== "active" || !campaignSnap.exists || !contactSnap.exists) return [];
      const campaign = campaignSnap.data()!;
      const contact = contactSnap.data()!;
      if (campaign.organizationId !== serverEnv().ORGANIZATION_ID || campaign.status !== "active" || contact.organizationId !== serverEnv().ORGANIZATION_ID || contact.status !== "active" || contact.doNotContact === true) return [];
      const title = String(contact.displayName ?? "CRM contact");
      const campaignName = String(campaign.name ?? "Campaign");
      const link = `/crm/workflows?workspaceId=${encodeURIComponent(String(member.workspaceId))}&campaignId=${encodeURIComponent(String(member.campaignId))}&memberId=${encodeURIComponent(memberId)}#${encodeURIComponent(memberId)}`;
      const isReply = kind === "reply_waiting";
      const taskId = typeof member.linkedFollowUpTaskId === "string" ? member.linkedFollowUpTaskId : undefined;
      const body = isReply ? `${title} replied in ${campaignName}. Review the conversation and respond.` : `A follow-up with ${title} is due in ${campaignName}.`;
      const destination = !isReply && taskId ? `/tasks/${encodeURIComponent(taskId)}` : link;
      return [{
        key: user.uid, uid: user.uid, email: user.email,
        inApp: { title: isReply ? "CRM reply waiting" : "CRM follow-up due", body, actionUrl: destination, resourceType: "crmCampaignMember", resourceId: memberId },
        compose: async () => ({
          templateId: isReply ? "crm_reply_waiting" : "crm_follow_up_due",
          subject: isReply ? `Reply waiting · ${title}` : `Follow-up due · ${title}`,
          preview: body,
          eyebrow: "CRM reminder",
          heading: isReply ? "An inbound reply is waiting for a response." : "A CRM follow-up is due.",
          paragraphs: [body, `Campaign: ${campaignName}.`],
          cta: { label: !isReply && taskId ? "Open follow-up task" : "Open CRM workflow", href: appUrl(destination) },
        }),
      }];
    },
  };
}

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

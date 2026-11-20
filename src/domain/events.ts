/**
 * Notification event catalogue. Every module registers its events here; the
 * server-side registry (src/server/notifications/registry.ts) supplies the
 * recipient resolver and message builders for each type.
 * See docs/notification-specification.md.
 */

export const EVENT_TYPES = [
  "USER_INVITED",
  "INVITATION_RESENT",
  "ACCOUNT_ACTIVATED",
  "USER_ROLE_CHANGED",
  "USER_TEAM_ASSIGNED",
  "USER_WORKSTREAM_ASSIGNED",
  "ACCOUNT_STATUS_CHANGED",
  "TASK_ASSIGNED",
  "TASK_STATUS_CHANGED",
  "TASK_COMMENTED",
  "WORK_REPORT_SUBMITTED",
  "WORK_REPORT_APPROVED",
  "WORK_REPORT_NEEDS_REVISION",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type EventCategory = "account" | "access" | "organisation" | "work";

export interface EventMeta {
  label: string;
  description: string;
  category: EventCategory;
  /** Essential security/account messages ignore optional preferences (workflow spec §5.2). */
  essential: boolean;
  channels: { inApp: boolean; email: boolean };
  module: 1 | 2 | 3 | 4 | 5;
}

export const EVENT_CATALOGUE: Record<EventType, EventMeta> = {
  USER_INVITED: {
    label: "Invitation",
    description: "An invitation to join Inhub Workspace.",
    category: "account",
    essential: true,
    channels: { inApp: false, email: true },
    module: 1,
  },
  INVITATION_RESENT: {
    label: "Invitation resent",
    description: "A fresh invitation link replacing an earlier one.",
    category: "account",
    essential: true,
    channels: { inApp: false, email: true },
    module: 1,
  },
  ACCOUNT_ACTIVATED: {
    label: "Account activated",
    description: "Welcome message, and a note to the inviter when an invitation is accepted.",
    category: "account",
    essential: true,
    channels: { inApp: true, email: true },
    module: 1,
  },
  USER_ROLE_CHANGED: {
    label: "Role changes",
    description: "Your platform role was changed by an Admin.",
    category: "access",
    essential: true,
    channels: { inApp: true, email: true },
    module: 1,
  },
  TASK_ASSIGNED: { label: "Task assignments", description: "A task was assigned or reassigned to you.", category: "work", essential: false, channels: { inApp: true, email: true }, module: 2 },
  TASK_STATUS_CHANGED: { label: "Task updates", description: "A task you participate in changed status.", category: "work", essential: false, channels: { inApp: true, email: false }, module: 2 },
  TASK_COMMENTED: { label: "Task comments and mentions", description: "A task participant commented or mentioned you.", category: "work", essential: false, channels: { inApp: true, email: true }, module: 2 },
  WORK_REPORT_SUBMITTED: { label: "Report submissions", description: "A report is waiting for your review.", category: "work", essential: false, channels: { inApp: true, email: true }, module: 3 },
  WORK_REPORT_APPROVED: { label: "Report approved", description: "Your work report was approved.", category: "work", essential: false, channels: { inApp: true, email: true }, module: 3 },
  WORK_REPORT_NEEDS_REVISION: { label: "Report revisions", description: "Your reviewer requested changes to a report.", category: "work", essential: false, channels: { inApp: true, email: true }, module: 3 },
  ACCOUNT_STATUS_CHANGED: {
    label: "Account status",
    description: "Your account was suspended, deactivated or reactivated.",
    category: "account",
    essential: true,
    channels: { inApp: true, email: true },
    module: 1,
  },
  USER_TEAM_ASSIGNED: {
    label: "Team assignments",
    description: "You, or someone in a team you lead, joined, left or moved team.",
    category: "organisation",
    essential: false,
    channels: { inApp: true, email: true },
    module: 1,
  },
  USER_WORKSTREAM_ASSIGNED: {
    label: "Workstream assignments",
    description: "You, or someone in a workstream you lead, joined or left a workstream.",
    category: "organisation",
    essential: false,
    channels: { inApp: true, email: true },
    module: 1,
  },
};

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export interface ChannelPreferenceInput {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  deliveryMode: "immediate" | "daily_digest" | "off";
  disabledEventTypes: readonly string[];
}

export const DEFAULT_PREFERENCES: ChannelPreferenceInput = {
  inAppEnabled: true,
  emailEnabled: true,
  deliveryMode: "immediate",
  disabledEventTypes: [],
};

/**
 * Decide which channels a recipient gets for an event. Essential events always
 * go out on their catalogue channels. Daily-digest delivery is recorded as
 * "digest" so the Module 5 digest job can pick it up; until that job ships,
 * digest emails are held, never silently dropped or sent immediately.
 */
export function resolveChannels(
  type: EventType,
  prefs: ChannelPreferenceInput,
): { inApp: boolean; email: "immediate" | "digest" | "none" } {
  const meta = EVENT_CATALOGUE[type];
  if (meta.essential) {
    return { inApp: meta.channels.inApp, email: meta.channels.email ? "immediate" : "none" };
  }
  const muted = prefs.disabledEventTypes.includes(type);
  const inApp = meta.channels.inApp && prefs.inAppEnabled && !muted;
  let email: "immediate" | "digest" | "none" = "none";
  if (meta.channels.email && prefs.emailEnabled && !muted && prefs.deliveryMode !== "off") {
    email = prefs.deliveryMode === "daily_digest" ? "digest" : "immediate";
  }
  return { inApp, email };
}

/** Bounded exponential backoff for email retries: 1, 4, 16, 64 min, then give up. */
export const MAX_EMAIL_ATTEMPTS = 5;
export function nextRetryDelayMs(attempt: number): number | null {
  if (attempt >= MAX_EMAIL_ATTEMPTS) return null;
  return Math.min(4 ** (attempt - 1), 64) * 60_000;
}

/** Errors worth retrying. Validation/auth errors from the provider are permanent. */
export function isRetryableStatus(httpStatus: number | undefined): boolean {
  if (httpStatus === undefined) return true; // network failure
  return httpStatus === 429 || httpStatus >= 500;
}

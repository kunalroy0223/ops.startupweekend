/** Runtime validation for every API input. Server handlers parse with these; clients may reuse them for early feedback. */
import { z } from "zod";
import { DELIVERY_MODES, ROLES, USER_STATUSES } from "./types";

const id = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, "Invalid identifier");
const name = z.string().trim().min(2, "Use at least 2 characters").max(80, "Use 80 characters or fewer");
const description = z.string().trim().max(500, "Use 500 characters or fewer").optional().or(z.literal("").transform(() => undefined));

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), "Include at least one letter and one number");

export const sessionCreateSchema = z.object({ idToken: z.string().min(20).max(8192) });

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const invitationCreateSchema = z.object({
  email: emailSchema,
  intendedRole: z.enum(["lead", "member"]),
  workspaceId: id,
  workstreamIds: z.array(id).max(20).default([]),
  teamIds: z.array(id).max(20).default([]),
});
export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;

export const invitationAcceptSchema = z.object({
  token: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
  displayName: name,
  password: passwordSchema,
});

export const profileSelfUpdateSchema = z
  .object({
    displayName: name.optional(),
    title: z.string().trim().max(80).optional(),
  })
  .strict();

export const userAdminUpdateSchema = z
  .object({
    displayName: name.optional(),
    title: z.string().trim().max(80).optional(),
  })
  .strict();

export const roleChangeSchema = z.object({ role: z.enum(ROLES), reason: z.string().trim().max(300).optional() });
export const statusChangeSchema = z.object({ status: z.enum(USER_STATUSES), reason: z.string().trim().max(300).optional() });

export const membershipAssignSchema = z.object({
  scopeKind: z.enum(["workstream", "team"]),
  scopeId: id,
  membershipType: z.enum(["lead", "member"]),
});

export const membershipTransferSchema = z.object({
  fromTeamId: id,
  toTeamId: id,
});

export const workspaceUpsertSchema = z.object({ name, description });
export const workstreamUpsertSchema = z.object({ workspaceId: id, name, description });
export const teamUpsertSchema = z.object({ workspaceId: id, name, description, workstreamIds: z.array(id).max(10).default([]) });
export const archiveSchema = z.object({ archived: z.boolean() });
export const teamLinkSchema = z.object({ workstreamId: id, linked: z.boolean() });

export const notificationPreferencesSchema = z.object({
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  deliveryMode: z.enum(DELIVERY_MODES),
  disabledEventTypes: z.array(z.string().max(64)).max(50),
});

export const markReadSchema = z.union([z.object({ ids: z.array(id).min(1).max(100) }), z.object({ all: z.literal(true) })]);

export const organizationSettingsSchema = z.object({
  name,
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
});

export const userListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  cursor: z.string().max(256).optional(),
});

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Normalised lowercase name used for prefix search in the directory. */
export function searchKey(displayName: string): string {
  return displayName.trim().toLowerCase().replace(/\s+/g, " ");
}


const safeHttpUrl = z.string().url().max(2048).refine((value) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "Use an HTTP or HTTPS URL");

const taskId = id;
export const meetingCreateSchema = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters").max(140),
  description: z.string().trim().max(1500).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  location: z.string().trim().max(180).optional(),
  meetingUrl: safeHttpUrl.optional(),
  attendeeUserIds: z.array(id).max(29).default([]),
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(value.startAt);
  const end = Date.parse(value.endAt);
  if (end <= start) ctx.addIssue({ code: "custom", path: ["endAt"], message: "The end time must be after the start time." });
  if (end - start > 12 * 60 * 60_000) ctx.addIssue({ code: "custom", path: ["endAt"], message: "Meetings cannot be longer than 12 hours." });
  if (!value.location && !value.meetingUrl) ctx.addIssue({ code: "custom", path: ["location"], message: "Add a location or meeting link." });
});

export const meetingUpdateSchema = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  description: z.string().trim().max(1500).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  location: z.string().trim().max(180).optional(),
  meetingUrl: safeHttpUrl.optional(),
  attendeeUserIds: z.array(id).max(29).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update").superRefine((value, ctx) => {
  if (value.startAt && value.endAt && Date.parse(value.endAt) <= Date.parse(value.startAt)) ctx.addIssue({ code: "custom", path: ["endAt"], message: "The end time must be after the start time." });
  if (value.startAt && value.endAt && Date.parse(value.endAt) - Date.parse(value.startAt) > 12 * 60 * 60_000) ctx.addIssue({ code: "custom", path: ["endAt"], message: "Meetings cannot be longer than 12 hours." });
});

export const meetingResponseSchema = z.object({ response: z.enum(["accepted", "tentative", "declined"]) }).strict();

export const projectCreateSchema = z.object({
  workspaceId: id,
  workstreamId: id.optional(),
  teamId: id.optional(),
  name,
  description,
});
export const projectUpdateSchema = z.object({ name, description }).strict();

export const taskCreateSchema = z.object({
  workspaceId: id,
  projectId: id.optional(),
  workstreamId: id.optional(),
  teamId: id.optional(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000).optional(),
  acceptanceCriteria: z.string().trim().max(3000).optional(),
  accountableUserId: id,
  collaboratorUserIds: z.array(id).max(20).default([]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  startAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  parentTaskId: taskId.optional(),
  dependencyIds: z.array(id).max(20).default([]),
  referenceLinks: z.array(safeHttpUrl).max(20).default([]),
}).superRefine((value, ctx) => {
  if (value.startAt && value.dueAt && Date.parse(value.startAt) > Date.parse(value.dueAt)) {
    ctx.addIssue({ code: "custom", path: ["dueAt"], message: "The due date must be on or after the planned start." });
  }
});
export const taskUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  acceptanceCriteria: z.string().trim().max(3000).optional(),
  accountableUserId: id.optional(),
  collaboratorUserIds: z.array(id).max(20).optional(),
  teamId: id.nullable().optional(),
  workstreamId: id.nullable().optional(),
  projectId: id.nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  startAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  parentTaskId: id.nullable().optional(),
  dependencyIds: z.array(id).max(20).optional(),
  referenceLinks: z.array(safeHttpUrl).max(20).optional(),
}).strict().refine((value) => !value.startAt || !value.dueAt || Date.parse(value.startAt) <= Date.parse(value.dueAt), {
  message: "The due date must be on or after the planned start.", path: ["dueAt"],
});
export const taskStatusSchema = z.object({
  status: z.enum(["backlog", "assigned", "in_progress", "in_review", "completed", "blocked", "cancelled"]),
  reason: z.string().trim().max(500).optional(),
});
export const taskCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  mentionedUserIds: z.array(id).max(20).default([]),
});


const reportDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((v) => {
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Enter a valid reporting date");

export const workReportCreateSchema = z.object({
  workspaceId: id,
  reportDate,
  teamId: id.optional(),
  workstreamId: id.optional(),
}).strict();

export const workReportEntrySchema = z.object({
  taskId: id.optional(),
  activityTitle: z.string().trim().min(2).max(160),
  workCompleted: z.string().trim().min(2).max(5000),
  progressSummary: z.string().trim().max(2000).optional(),
  timeSpentMinutes: z.number().int().min(0).max(1440).optional(),
  blockers: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  nextSteps: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  linkUrls: z.array(safeHttpUrl).max(20).default([]),
  attachmentIds: z.array(id).max(20).default([]),
}).strict();

export const workReportReviewSchema = z.object({
  decision: z.enum(["approved", "needs_revision"]),
  comment: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "needs_revision" && !value.comment?.trim()) {
    ctx.addIssue({ code: "custom", path: ["comment"], message: "A comment is required when requesting a revision." });
  }
});


export const taskAttachmentCreateSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  contentType: z.string().trim().min(3).max(160),
  size: z.number().int().positive().max(10 * 1024 * 1024),
}).strict();

// ── Module 9: CRM account/contact validation ──────────────────────────────

const crmTags = z.array(z.string().trim().min(1).max(40)).max(30).default([]);
const optionalCrmText = (max: number) => z.string().trim().max(max).optional();
const optionalCrmUrl = safeHttpUrl.optional();

export const crmAccountCreateSchema = z.object({
  workspaceId: id,
  name: z.string().trim().min(2).max(160),
  accountType: z.enum(["company", "startup", "institution", "investor", "government", "nonprofit", "community", "other"]),
  industry: optionalCrmText(100),
  website: optionalCrmUrl,
  city: optionalCrmText(100),
  region: optionalCrmText(100),
  country: optionalCrmText(100),
  ownerUserId: id.optional(),
  source: optionalCrmText(100),
  tags: crmTags,
  notes: optionalCrmText(5000),
}).strict();

export const crmAccountUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  accountType: z.enum(["company", "startup", "institution", "investor", "government", "nonprofit", "community", "other"]).optional(),
  industry: optionalCrmText(100).nullable().optional(),
  website: safeHttpUrl.nullable().optional(),
  city: optionalCrmText(100).nullable().optional(),
  region: optionalCrmText(100).nullable().optional(),
  country: optionalCrmText(100).nullable().optional(),
  ownerUserId: id.optional(),
  source: optionalCrmText(100).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  notes: optionalCrmText(5000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const crmContactCreateSchema = z.object({
  workspaceId: id,
  recordType: z.enum(["person", "creator_profile", "brand_profile", "community_profile", "other"]),
  displayName: z.string().trim().min(2).max(160),
  accountId: id.optional(),
  email: emailSchema.optional(),
  phone: optionalCrmText(40),
  instagramHandle: z.string().trim().regex(/^@?[A-Za-z0-9._]{1,30}$/, "Enter a valid Instagram handle.").optional(),
  instagramProfileUrl: optionalCrmUrl,
  linkedinProfileUrl: optionalCrmUrl,
  category: optionalCrmText(100),
  ownerUserId: id.optional(),
  source: optionalCrmText(100),
  tags: crmTags,
  notes: optionalCrmText(5000),
}).strict();

export const crmContactUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  accountId: id.nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  instagramHandle: z.string().trim().regex(/^@?[A-Za-z0-9._]{1,30}$/, "Enter a valid Instagram handle.").nullable().optional(),
  instagramProfileUrl: safeHttpUrl.nullable().optional(),
  linkedinProfileUrl: safeHttpUrl.nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  ownerUserId: id.optional(),
  source: z.string().trim().max(100).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const crmDoNotContactSchema = z.object({
  doNotContact: z.boolean(),
  reason: z.string().trim().min(3).max(300).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.doNotContact && !value.reason?.trim()) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required to clear do-not-contact status." });
  }
});

export const crmWorkspaceQuerySchema = z.object({ workspaceId: id });

export const automationRuleUpdateSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])),
}).strict();



// ── CRM workflows: partnership pipeline, outreach campaigns and activities ──

export const crmOpportunityCreateSchema = z.object({
  workspaceId: id,
  title: z.string().trim().min(2).max(160),
  opportunityType: z.enum(["sponsorship", "institutional_partnership", "mentor", "speaker", "judge", "community", "collaboration", "other"]),
  accountId: id.optional(),
  primaryContactId: id.optional(),
  ownerUserId: id.optional(),
  supportingUserIds: z.array(id).max(20).default([]),
  expectedValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  contributionDescription: z.string().trim().max(2000).optional(),
  expectedDecisionAt: z.string().datetime().optional(),
  nextStep: z.string().trim().max(1000).optional(),
  sourceCampaignId: id.optional(),
}).strict();

export const crmOpportunityUpdateSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  opportunityType: z.enum(["sponsorship", "institutional_partnership", "mentor", "speaker", "judge", "community", "collaboration", "other"]).optional(),
  accountId: id.nullable().optional(),
  primaryContactId: id.nullable().optional(),
  ownerUserId: id.optional(),
  supportingUserIds: z.array(id).max(20).optional(),
  expectedValue: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).nullable().optional(),
  contributionDescription: z.string().trim().max(2000).nullable().optional(),
  expectedDecisionAt: z.string().datetime().nullable().optional(),
  nextStep: z.string().trim().max(1000).nullable().optional(),
  sourceCampaignId: id.nullable().optional(),
  stageKey: z.enum(["prospecting", "qualified", "discovery", "proposal", "negotiation", "nurture", "won", "lost"]).optional(),
  outcomeReason: z.string().trim().max(1000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const crmCampaignCreateSchema = z.object({
  workspaceId: id,
  name: z.string().trim().min(2).max(160),
  objective: z.string().trim().min(2).max(2000),
  campaignType: z.enum(["partnership_acquisition", "instagram_outreach", "mentor_acquisition", "community_engagement", "other"]),
  channel: z.enum(["instagram", "email", "phone", "in_person", "event", "referral", "other"]),
  ownerUserId: id.optional(),
  workstreamId: id.optional(),
  teamId: id.optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  tags: crmTags,
}).strict().refine((value) => !value.startAt || !value.endAt || Date.parse(value.endAt) >= Date.parse(value.startAt), {
  message: "Campaign end must be on or after its start.", path: ["endAt"],
});

export const crmCampaignUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  objective: z.string().trim().min(2).max(2000).optional(),
  status: z.enum(["draft", "active", "paused", "completed", "archived"]).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  tags: crmTags.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const crmCampaignMemberCreateSchema = z.object({
  contactId: id,
  assignedToUserId: id.optional(),
}).strict();

export const crmCampaignMemberUpdateSchema = z.object({
  stage: z.enum(["researched", "qualified", "ready_to_contact", "contacted", "replied", "interested", "converted", "nurture", "not_interested", "do_not_contact"]).optional(),
  assignedToUserId: id.optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  linkedFollowUpTaskId: id.nullable().optional(),
  outcomeReason: z.string().trim().max(1000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const crmActivityCreateSchema = z.object({
  campaignMemberId: id.optional(),
  opportunityId: id.optional(),
  contactId: id.optional(),
  accountId: id.optional(),
  activityType: z.enum(["researched", "qualified", "initial_outreach", "reply_received", "follow_up_sent", "call", "meeting", "proposal_shared", "stage_changed", "outcome_recorded", "note", "correction"]),
  channel: z.enum(["instagram", "email", "phone", "meeting", "in_person", "internal", "other"]),
  direction: z.enum(["inbound", "outbound", "internal"]).optional(),
  occurredAt: z.string().datetime().optional(),
  summary: z.string().trim().min(2).max(2000),
  outcome: z.string().trim().max(1000).optional(),
  correctsActivityId: id.optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.campaignMemberId && !value.opportunityId && !value.contactId && !value.accountId) {
    ctx.addIssue({ code: "custom", path: ["campaignMemberId"], message: "Link this activity to a campaign member, opportunity, contact or account." });
  }
  if (value.activityType === "correction" && !value.correctsActivityId) {
    ctx.addIssue({ code: "custom", path: ["correctsActivityId"], message: "Choose the activity this entry corrects." });
  }
});

// ── Modules 10–12: programme operations, assets and governance ─────────────

const optionalDateTime = z.string().datetime().optional();
const dateRange = (value: { startAt?: string; endAt?: string }, ctx: z.RefinementCtx) => {
  if (value.startAt && value.endAt && Date.parse(value.endAt) <= Date.parse(value.startAt)) {
    ctx.addIssue({ code: "custom", path: ["endAt"], message: "End time must be after start time." });
  }
};

export const programmeCreateSchema = z.object({
  workspaceId: id,
  name: z.string().trim().min(3).max(140),
  programmeType: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional(),
  ownerUserId: id.optional(),
  workstreamId: id.optional(),
  teamId: id.optional(),
  startAt: optionalDateTime,
  endAt: optionalDateTime,
}).strict().superRefine(dateRange);

export const programmeUpdateSchema = z.object({
  name: z.string().trim().min(3).max(140).optional(),
  programmeType: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const operationalEventCreateSchema = z.object({
  workspaceId: id,
  programmeId: id.optional(),
  title: z.string().trim().min(3).max(160),
  eventType: z.enum(["workshop", "pitch_session", "networking", "community", "outreach", "programme", "other"]),
  description: z.string().trim().max(2500).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  venue: z.string().trim().max(240).optional(),
  meetingUrl: safeHttpUrl.optional(),
  ownerUserId: id.optional(),
  workstreamId: id.optional(),
  teamId: id.optional(),
  operationsNotes: z.string().trim().max(2500).optional(),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.endAt) <= Date.parse(value.startAt)) ctx.addIssue({ code: "custom", path: ["endAt"], message: "End time must be after start time." });
});

export const operationalEventUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(2500).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  venue: z.string().trim().max(240).nullable().optional(),
  meetingUrl: safeHttpUrl.nullable().optional(),
  operationsNotes: z.string().trim().max(2500).nullable().optional(),
  status: z.enum(["planning", "confirmed", "live", "completed", "cancelled", "archived"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update").superRefine(dateRange);

export const programmeSessionCreateSchema = z.object({
  workspaceId: id,
  programmeId: id,
  eventId: id.optional(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1500).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  facilitator: z.string().trim().max(160).optional(),
  location: z.string().trim().max(200).optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.endAt) <= Date.parse(value.startAt)) ctx.addIssue({ code: "custom", path: ["endAt"], message: "End time must be after start time." });
});

export const programmeSessionUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(1500).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  facilitator: z.string().trim().max(160).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["planned", "live", "completed", "cancelled"]).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update").superRefine(dateRange);

export const resourceCreateSchema = z.object({
  workspaceId: id,
  kind: z.enum(["asset", "shared_resource"]),
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1500).optional(),
  inventoryCode: z.string().trim().max(80).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  totalQuantity: z.number().int().min(1).max(10000),
  location: z.string().trim().max(180).optional(),
  custodianUserId: id.optional(),
  condition: z.enum(["new", "good", "fair", "needs_repair"]).default("good"),
  workstreamId: id.optional(),
  teamId: id.optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();

export const resourceUpdateSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(1500).nullable().optional(),
  inventoryCode: z.string().trim().max(80).nullable().optional(),
  serialNumber: z.string().trim().max(120).nullable().optional(),
  totalQuantity: z.number().int().min(1).max(10000).optional(),
  location: z.string().trim().max(180).nullable().optional(),
  custodianUserId: id.nullable().optional(),
  condition: z.enum(["new", "good", "fair", "needs_repair"]).optional(),
  status: z.enum(["available", "maintenance", "retired", "archived"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const resourceAllocationCreateSchema = z.object({
  workspaceId: id,
  resourceId: id,
  quantity: z.number().int().min(1).max(10000),
  allocatedToUserId: id.optional(),
  purpose: z.string().trim().min(3).max(500),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  linkedEventId: id.optional(),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.endAt) <= Date.parse(value.startAt)) ctx.addIssue({ code: "custom", path: ["endAt"], message: "End time must be after start time." });
});

export const resourceAllocationUpdateSchema = z.object({
  status: z.enum(["approved", "rejected", "checked_out", "returned", "cancelled"]),
  decisionNote: z.string().trim().max(500).optional(),
}).strict();

export const governancePolicyCreateSchema = z.object({
  area: z.enum(["people", "projects", "reports", "crm", "events", "resources", "documents", "audit", "general"]),
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(1500).optional(),
  retentionDays: z.number().int().min(1).max(36500).optional(),
  disposition: z.enum(["retain", "review", "archive", "delete_after_approval"]),
  legalHold: z.boolean().default(false),
  reviewIntervalDays: z.number().int().min(30).max(3650).default(365),
  nextReviewAt: z.string().datetime().optional(),
  ownerUserId: id,
}).strict();

export const governancePolicyUpdateSchema = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  description: z.string().trim().max(1500).nullable().optional(),
  retentionDays: z.number().int().min(1).max(36500).nullable().optional(),
  disposition: z.enum(["retain", "review", "archive", "delete_after_approval"]).optional(),
  legalHold: z.boolean().optional(),
  reviewIntervalDays: z.number().int().min(30).max(3650).optional(),
  nextReviewAt: z.string().datetime().nullable().optional(),
  ownerUserId: id.optional(),
  status: z.enum(["active", "review_due", "archived"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const governanceReviewCreateSchema = z.object({
  policyId: id,
  decision: z.enum(["retain", "archive", "legal_hold", "escalate"]),
  reason: z.string().trim().min(5).max(1200),
  recordReference: z.string().trim().max(240).optional(),
}).strict();

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
  dueAt: z.string().datetime().optional(),
  parentTaskId: taskId.optional(),
  dependencyIds: z.array(id).max(20).default([]),
  referenceLinks: z.array(safeHttpUrl).max(20).default([]),
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
  dueAt: z.string().datetime().nullable().optional(),
  parentTaskId: id.nullable().optional(),
  dependencyIds: z.array(id).max(20).optional(),
  referenceLinks: z.array(safeHttpUrl).max(20).optional(),
}).strict();
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
}).strict();

export const workReportReviewSchema = z.object({
  decision: z.enum(["approved", "needs_revision"]),
  comment: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "needs_revision" && !value.comment?.trim()) {
    ctx.addIssue({ code: "custom", path: ["comment"], message: "A comment is required when requesting a revision." });
  }
});

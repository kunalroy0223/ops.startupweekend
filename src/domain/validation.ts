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

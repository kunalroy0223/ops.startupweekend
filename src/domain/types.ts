/**
 * Domain model. Mirrors docs/database-schema.md. Timestamps are ISO strings once
 * they leave the data layer so they can cross the server/client boundary.
 */

export const ROLES = ["admin", "lead", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  lead: "Lead",
  member: "Team Member",
};

export const USER_STATUSES = ["invited", "active", "suspended", "deactivated"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
};

export type ResourceStatus = "active" | "archived";
export type MembershipType = "lead" | "member";
export type MembershipStatus = "active" | "inactive";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: ResourceStatus;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  organizationId: string;
  email: string;
  emailNormalized: string;
  displayName: string;
  searchName: string;
  title?: string;
  photoURL?: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  invitedBy?: string;
  deactivatedAt?: string;
}

export const INVITATION_STATUSES = ["pending", "accepted", "expired", "revoked"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  emailNormalized: string;
  intendedRole: Exclude<Role, "admin">;
  workspaceIds: string[];
  initialWorkstreamIds: string[];
  initialTeamIds: string[];
  status: InvitationStatus;
  expiresAt: string;
  invitedBy: string;
  acceptedBy?: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  status: ResourceStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface Workstream {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  slug: string;
  description?: string;
  status: ResourceStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export type Team = Workstream;

export interface Membership {
  id: string;
  organizationId: string;
  workspaceId: string;
  /** workstreamId for workstream memberships, teamId for team memberships */
  scopeId: string;
  scopeKind: "workstream" | "team";
  userId: string;
  membershipType: MembershipType;
  status: MembershipStatus;
  assignedBy: string;
  assignedAt: string;
  endedAt?: string;
}

export interface WorkstreamTeam {
  id: string;
  organizationId: string;
  workspaceId: string;
  workstreamId: string;
  teamId: string;
  status: MembershipStatus;
  createdBy: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  /** Additional user IDs the entry concerns, so "own activity" can be queried. */
  subjectUserIds: string[];
  workspaceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  organizationId: string;
  recipientUserId: string;
  eventId: string;
  eventType: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  actionUrl?: string;
  readAt?: string;
  createdAt: string;
}

export const DELIVERY_MODES = ["immediate", "daily_digest", "off"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export interface NotificationPreferences {
  userId: string;
  organizationId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  deliveryMode: DeliveryMode;
  disabledEventTypes: string[];
  updatedAt?: string;
}

export const EVENT_STATUSES = ["pending", "processing", "processed", "failed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface DomainEvent {
  id: string;
  organizationId: string;
  eventType: string;
  actorUserId?: string;
  resourceType: string;
  resourceId: string;
  workspaceId?: string;
  payload: Record<string, unknown>;
  status: EventStatus;
  attempts: number;
  createdAt: string;
  processedAt?: string;
  lastErrorCode?: string;
  leaseUntil?: string;
}

export const EMAIL_DELIVERY_STATUSES = ["pending", "sent", "delivered", "bounced", "failed"] as const;
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

export interface EmailDelivery {
  id: string;
  organizationId: string;
  eventId: string;
  recipientUserId?: string;
  recipientEmail: string;
  templateId: string;
  provider: "resend";
  providerMessageId?: string;
  status: EmailDeliveryStatus;
  idempotencyKey: string;
  attempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  lastErrorCode?: string;
  createdAt: string;
  updatedAt: string;
}


export const TASK_STATUSES = ["backlog", "assigned", "in_progress", "in_review", "completed", "blocked", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Project {
  id: string;
  organizationId: string;
  workspaceId: string;
  workstreamId?: string;
  teamId?: string;
  name: string;
  slug: string;
  description?: string;
  status: "active" | "archived";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface Task {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId?: string;
  workstreamId?: string;
  teamId?: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  accountableUserId: string;
  collaboratorUserIds: string[];
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string;
  parentTaskId?: string;
  dependencyIds: string[];
  referenceLinks?: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
}

export interface TaskComment {
  id: string;
  organizationId: string;
  workspaceId: string;
  taskId: string;
  authorUserId: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: string;
  deletedAt?: string;
}


export type WorkReportStatus = "draft" | "submitted" | "needs_revision" | "approved";

export interface WorkReport {
  id: string;
  organizationId: string;
  workspaceId: string;
  userId: string;
  reportDate: string;
  teamId?: string;
  workstreamId?: string;
  status: WorkReportStatus;
  reviewerId?: string;
  reviewerComment?: string;
  submittedAt?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt?: string;
}

export interface WorkReportEntry {
  id: string;
  taskId?: string;
  activityTitle: string;
  workCompleted: string;
  progressSummary?: string;
  timeSpentMinutes?: number;
  blockers: string[];
  nextSteps: string[];
  linkUrls: string[];
  attachmentIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkReportReview {
  id: string;
  reviewerId: string;
  decision: "approved" | "needs_revision";
  comment?: string;
  version: number;
  createdAt: string;
}

export interface WorkReportVersion {
  id: string;
  version: number;
  submittedAt: string;
  submittedBy: string;
  entries: Omit<WorkReportEntry, "createdAt" | "updatedAt">[];
}


export interface WorkReportAttachment {
  id: string;
  reportId: string;
  workspaceId: string;
  uploadedBy: string;
  fileName: string;
  contentType: string;
  size: number;
  storagePath: string;
  status: "pending" | "active" | "deleted";
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  workspaceId: string;
  uploadedBy: string;
  fileName: string;
  contentType: string;
  size: number;
  storagePath: string;
  status: "pending" | "active" | "deleted";
  createdAt: string;
}

// ── Module 4: automation and notification digest ──────────────────────────

export type AutomationRunStatus = "pending" | "processing" | "completed" | "skipped" | "retry" | "failed";
export type AutomationTriggerType = "domain_event" | "scheduled_query";

export interface AutomationRule {
  id: string;
  organizationId: string;
  workspaceId?: string;
  ruleKey: string;
  triggerType: AutomationTriggerType;
  enabled: boolean;
  config: Record<string, string | number | boolean | string[] | null>;
  schemaVersion: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  organizationId: string;
  workspaceId?: string;
  ruleId: string;
  ruleKey: string;
  targetType: string;
  targetId: string;
  recipientUserId: string;
  occurrenceKey: string;
  idempotencyKey: string;
  status: AutomationRunStatus;
  attempts: number;
  leaseUntil?: string;
  nextRetryAt?: string;
  domainEventId?: string;
  lastErrorCode?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDigestItem {
  id: string;
  organizationId: string;
  recipientUserId: string;
  eventId: string;
  eventType: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  actionUrl?: string;
  status: "pending" | "batched" | "sent" | "skipped";
  digestId?: string;
  createdAt: string;
  includedAt?: string;
}

export interface NotificationDigest {
  id: string;
  organizationId: string;
  recipientUserId: string;
  digestDate: string;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  itemCount: number;
  eventId: string;
  emailDeliveryId?: string;
  status: "queued" | "sent" | "failed";
  createdAt: string;
  updatedAt: string;
}

// ── Module 9: CRM ─────────────────────────────────────────────────────────

export type CrmAccountType = "company" | "startup" | "institution" | "investor" | "government" | "nonprofit" | "community" | "other";
export type CrmContactRecordType = "person" | "creator_profile" | "brand_profile" | "community_profile" | "other";
export type CrmStatus = "active" | "archived";

export interface CrmAccount {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  accountType: CrmAccountType;
  industry?: string;
  website?: string;
  websiteDomainNormalized?: string;
  city?: string;
  region?: string;
  country?: string;
  ownerUserId: string;
  source?: string;
  tags: string[];
  status: CrmStatus;
  notes?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  schemaVersion: number;
}

export interface CrmContact {
  id: string;
  organizationId: string;
  workspaceId: string;
  recordType: CrmContactRecordType;
  displayName: string;
  normalizedName: string;
  accountId?: string;
  email?: string;
  emailNormalized?: string;
  phone?: string;
  instagramHandleNormalized?: string;
  instagramProfileUrl?: string;
  linkedinProfileUrl?: string;
  category?: string;
  ownerUserId: string;
  source?: string;
  tags: string[];
  doNotContact: boolean;
  doNotContactReason?: string;
  doNotContactSetBy?: string;
  doNotContactSetAt?: string;
  status: CrmStatus;
  notes?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  schemaVersion: number;
}

export interface CrmIdentityKey {
  id: string;
  organizationId: string;
  workspaceId: string;
  identityType: "email" | "instagram_handle" | "website_domain";
  entityType: "contact" | "account";
  entityId: string;
  createdAt: string;
}

export type CrmOpportunityStatus = "open" | "won" | "lost" | "nurture" | "archived";
export interface CrmOpportunity {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  opportunityType: "sponsorship" | "institutional_partnership" | "mentor" | "speaker" | "judge" | "community" | "collaboration" | "other";
  accountId?: string;
  primaryContactId?: string;
  pipelineKey: "partnership";
  stageKey: string;
  status: CrmOpportunityStatus;
  ownerUserId: string;
  supportingUserIds: string[];
  expectedValue?: number;
  currency?: string;
  contributionDescription?: string;
  expectedDecisionAt?: string;
  nextStep?: string;
  outcomeReason?: string;
  sourceCampaignId?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  stageChangedAt: string;
  archivedAt?: string;
  schemaVersion: number;
}

export interface CrmCampaign {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  objective: string;
  campaignType: "partnership_acquisition" | "instagram_outreach" | "mentor_acquisition" | "community_engagement" | "other";
  channel: "instagram" | "email" | "phone" | "in_person" | "event" | "referral" | "other";
  ownerUserId: string;
  workstreamId?: string;
  teamId?: string;
  startAt?: string;
  endAt?: string;
  status: "draft" | "active" | "paused" | "completed" | "archived";
  tags: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  schemaVersion: number;
}

export interface CrmCampaignMember {
  id: string;
  organizationId: string;
  workspaceId: string;
  campaignId: string;
  contactId: string;
  assignedToUserId: string;
  stage: "researched" | "qualified" | "ready_to_contact" | "contacted" | "replied" | "interested" | "converted" | "nurture" | "not_interested" | "do_not_contact";
  firstContactAt?: string;
  lastInteractionAt?: string;
  nextFollowUpAt?: string;
  linkedFollowUpTaskId?: string;
  convertedAt?: string;
  outcomeReason?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmActivity {
  id: string;
  organizationId: string;
  workspaceId: string;
  accountId?: string;
  contactId?: string;
  opportunityId?: string;
  campaignId?: string;
  campaignMemberId?: string;
  actorUserId: string;
  activityType: "researched" | "qualified" | "initial_outreach" | "reply_received" | "follow_up_sent" | "call" | "meeting" | "proposal_shared" | "stage_changed" | "outcome_recorded" | "note" | "correction";
  correctsActivityId?: string;
  channel: "instagram" | "email" | "phone" | "meeting" | "in_person" | "internal" | "other";
  direction?: "inbound" | "outbound" | "internal";
  occurredAt: string;
  summary: string;
  outcome?: string;
  requestId?: string;
  createdAt: string;
}

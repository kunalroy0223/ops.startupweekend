import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canAccessCrmRecord, isAdmin, type Actor } from "@/domain/authz";
import {
  crmCampaignMemberDocumentId,
  partnershipStatusForStage,
  type PartnershipStageKey,
} from "@/domain/crm-workflows";
import type {
  CrmAccount,
  CrmActivity,
  CrmCampaign,
  CrmCampaignMember,
  CrmContact,
  CrmOpportunity,
  Task,
} from "@/domain/types";
import { isAutomationTaskOpen } from "@/domain/automation";
import { writeAudit } from "../audit";
import { col, fromDoc, now, tsFromMs } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { ApiError, conflict, forbidden, notFound } from "../http";
import { getScope } from "../scope";
import { canAccessTask } from "./tasks";

const org = () => serverEnv().ORGANIZATION_ID;
const SCHEMA_VERSION = 1;
const clean = (value: string | null | undefined) => value?.trim() || undefined;
const dateTs = (value: string | null | undefined) => value ? tsFromMs(Date.parse(value)) : null;

async function assertWorkspace(actor: Actor, workspaceId: string): Promise<Set<string>> {
  const snap = await col("workspaces").doc(workspaceId).get();
  if (!snap.exists || snap.data()?.organizationId !== org() || snap.data()?.status !== "active") throw notFound("Workspace not found or inactive.");
  if (isAdmin(actor)) return new Set([workspaceId]);
  const scope = await getScope(actor.uid);
  if (!scope.workspaceIds.has(workspaceId)) throw forbidden("This workspace is outside your assigned scope.");
  return new Set(scope.workspaceIds);
}

async function assertActiveUser(userId: string, workspaceId: string): Promise<void> {
  const snap = await col("users").doc(userId).get();
  if (!snap.exists || snap.data()?.organizationId !== org() || snap.data()?.status !== "active") {
    throw new ApiError(422, "invalid_crm_owner", "Choose an active Inhub user.");
  }
  if (snap.data()?.role !== "admin") {
    const scope = await getScope(userId);
    if (!scope.workspaceIds.has(workspaceId)) throw new ApiError(422, "crm_owner_outside_workspace", "The assigned user must have an active membership in this workspace.");
  }
}

async function assertRecordAccess(actor: Actor, record: { organizationId: string; workspaceId: string; ownerUserId: string }): Promise<void> {
  const workspaceIds = isAdmin(actor) ? new Set<string>() : (await getScope(actor.uid)).workspaceIds;
  if (!canAccessCrmRecord(actor, workspaceIds, record)) throw notFound("CRM record not found.");
}

async function getCampaign(actor: Actor, campaignId: string): Promise<CrmCampaign> {
  const snap = await col("crmCampaigns").doc(campaignId).get();
  if (!snap.exists) throw notFound("CRM campaign not found.");
  const campaign = fromDoc<CrmCampaign>(snap);
  if (campaign.organizationId !== org()) throw notFound("CRM campaign not found.");
  await assertWorkspace(actor, campaign.workspaceId);
  if (!isAdmin(actor) && campaign.ownerUserId !== actor.uid) {
    const assignments = await col("crmCampaignMembers")
      .where("organizationId", "==", org())
      .where("campaignId", "==", campaignId)
      .where("assignedToUserId", "==", actor.uid)
      .limit(1).get();
    if (assignments.empty) throw notFound("CRM campaign not found.");
  }
  return campaign;
}

async function getOpportunity(actor: Actor, id: string): Promise<CrmOpportunity> {
  const snap = await col("crmOpportunities").doc(id).get();
  if (!snap.exists) throw notFound("CRM opportunity not found.");
  const record = fromDoc<CrmOpportunity>(snap);
  if (record.organizationId !== org()) throw notFound("CRM opportunity not found.");
  if (!isAdmin(actor)) {
    const scope = await getScope(actor.uid);
    if (!scope.workspaceIds.has(record.workspaceId) || (record.ownerUserId !== actor.uid && !(record.supportingUserIds ?? []).includes(actor.uid))) {
      throw notFound("CRM opportunity not found.");
    }
  }
  return record;
}

async function getContact(actor: Actor, id: string): Promise<CrmContact> {
  const snap = await col("crmContacts").doc(id).get();
  if (!snap.exists) throw notFound("CRM contact not found.");
  const record = fromDoc<CrmContact>(snap);
  if (record.organizationId !== org() || record.status !== "active") throw notFound("CRM contact not found.");
  await assertRecordAccess(actor, record);
  return record;
}

async function getAccount(actor: Actor, id: string): Promise<CrmAccount> {
  const snap = await col("crmAccounts").doc(id).get();
  if (!snap.exists) throw notFound("CRM account not found.");
  const record = fromDoc<CrmAccount>(snap);
  if (record.organizationId !== org() || record.status !== "active") throw notFound("CRM account not found.");
  await assertRecordAccess(actor, record);
  return record;
}

async function getCampaignMember(actor: Actor, id: string): Promise<{ member: CrmCampaignMember; campaign: CrmCampaign }> {
  const snap = await col("crmCampaignMembers").doc(id).get();
  if (!snap.exists) throw notFound("Campaign contact not found.");
  const member = fromDoc<CrmCampaignMember>(snap);
  if (member.organizationId !== org()) throw notFound("Campaign contact not found.");
  const campaign = await getCampaign(actor, member.campaignId);
  if (!isAdmin(actor) && campaign.ownerUserId !== actor.uid && member.assignedToUserId !== actor.uid) throw notFound("Campaign contact not found.");
  return { member, campaign };
}

async function validateSameWorkspaceRefs(actor: Actor, workspaceId: string, accountId?: string | null, contactId?: string | null) {
  if (accountId) {
    const account = await getAccount(actor, accountId);
    if (account.workspaceId !== workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "The account must belong to the selected workspace.");
  }
  if (contactId) {
    const contact = await getContact(actor, contactId);
    if (contact.workspaceId !== workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "The contact must belong to the selected workspace.");
  }
}

function activityRecord(input: {
  workspaceId: string; actorUserId: string; activityType: CrmActivity["activityType"]; channel: CrmActivity["channel"];
  direction?: CrmActivity["direction"]; occurredAt: string; summary: string; outcome?: string;
  accountId?: string; contactId?: string; opportunityId?: string; campaignId?: string; campaignMemberId?: string;
  correctsActivityId?: string; requestId: string;
}) {
  return {
    organizationId: org(), workspaceId: input.workspaceId, actorUserId: input.actorUserId,
    activityType: input.activityType, channel: input.channel, direction: input.direction ?? "internal",
    occurredAt: tsFromMs(Date.parse(input.occurredAt)), summary: input.summary.trim(), outcome: clean(input.outcome) ?? null,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.contactId ? { contactId: input.contactId } : {}),
    ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}),
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    ...(input.campaignMemberId ? { campaignMemberId: input.campaignMemberId } : {}),
    ...(input.correctsActivityId ? { correctsActivityId: input.correctsActivityId } : {}),
    requestId: input.requestId,
    createdAt: now(),
  };
}

export async function listCrmWorkflowData(actor: Actor, workspaceId: string) {
  await assertWorkspace(actor, workspaceId);
  const [opportunitySnap, campaignSnap, memberSnap, activitySnap] = await Promise.all([
    col("crmOpportunities").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("updatedAt", "desc").limit(250).get(),
    col("crmCampaigns").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("updatedAt", "desc").limit(250).get(),
    col("crmCampaignMembers").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("updatedAt", "desc").limit(500).get(),
    col("crmActivities").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).orderBy("occurredAt", "desc").limit(300).get(),
  ]);
  const opportunities = opportunitySnap.docs.map((doc) => fromDoc<CrmOpportunity>(doc));
  const campaigns = campaignSnap.docs.map((doc) => fromDoc<CrmCampaign>(doc));
  const members = memberSnap.docs.map((doc) => fromDoc<CrmCampaignMember>(doc));
  const activities = activitySnap.docs.map((doc) => fromDoc<CrmActivity>(doc));
  if (isAdmin(actor)) return { opportunities, campaigns, members, activities, workflowContacts: [] as CrmContact[], workflowAccounts: [] as CrmAccount[] };

  const visibleOpportunities = opportunities.filter((record) => record.ownerUserId === actor.uid || (record.supportingUserIds ?? []).includes(actor.uid));
  const ownedCampaignIds = new Set(campaigns.filter((record) => record.ownerUserId === actor.uid).map((record) => record.id));
  const visibleMembers = members.filter((member) => member.assignedToUserId === actor.uid || ownedCampaignIds.has(member.campaignId));
  const visibleCampaignIds = new Set([...ownedCampaignIds, ...visibleMembers.map((member) => member.campaignId)]);
  const visibleCampaigns = campaigns.filter((record) => visibleCampaignIds.has(record.id));
  const visibleMemberIds = new Set(visibleMembers.map((member) => member.id));
  const visibleOpportunityIds = new Set(visibleOpportunities.map((record) => record.id));
  const visibleActivities = activities.filter((activity) => activity.actorUserId === actor.uid
    || (activity.campaignMemberId && visibleMemberIds.has(activity.campaignMemberId))
    || (activity.campaignId && visibleCampaignIds.has(activity.campaignId))
    || (activity.opportunityId && visibleOpportunityIds.has(activity.opportunityId)));
  const relatedContactIds = [...new Set([
    ...visibleMembers.map((member) => member.contactId),
    ...visibleOpportunities.map((record) => record.primaryContactId).filter((id): id is string => !!id),
  ])];
  const contactSnaps = await Promise.all(relatedContactIds.map((contactId) => col("crmContacts").doc(contactId).get()));
  const workflowContacts = contactSnaps
    .filter((snap) => snap.exists && snap.data()?.organizationId === org() && snap.data()?.workspaceId === workspaceId && snap.data()?.status === "active")
    .map((snap) => fromDoc<CrmContact>(snap));
  const relatedAccountIds = [...new Set([
    ...visibleOpportunities.map((record) => record.accountId).filter((id): id is string => !!id),
    ...workflowContacts.map((contact) => contact.accountId).filter((id): id is string => !!id),
  ])];
  const accountSnaps = await Promise.all(relatedAccountIds.map((accountId) => col("crmAccounts").doc(accountId).get()));
  const workflowAccounts = accountSnaps
    .filter((snap) => snap.exists && snap.data()?.organizationId === org() && snap.data()?.workspaceId === workspaceId && snap.data()?.status === "active")
    .map((snap) => fromDoc<CrmAccount>(snap));
  return { opportunities: visibleOpportunities, campaigns: visibleCampaigns, members: visibleMembers, activities: visibleActivities, workflowContacts, workflowAccounts };
}

export async function createCrmOpportunity(actor: Actor, input: {
  workspaceId: string; title: string; opportunityType: CrmOpportunity["opportunityType"]; accountId?: string; primaryContactId?: string;
  ownerUserId?: string; supportingUserIds: string[]; expectedValue?: number; currency?: string; contributionDescription?: string;
  expectedDecisionAt?: string; nextStep?: string; sourceCampaignId?: string;
}, requestId: string): Promise<string> {
  if (actor.role === "member") throw forbidden("Team Members cannot create partnership opportunities.");
  await assertWorkspace(actor, input.workspaceId);
  const ownerUserId = isAdmin(actor) ? (input.ownerUserId ?? actor.uid) : actor.uid;
  if (input.ownerUserId && !isAdmin(actor)) throw forbidden("Only an Admin can assign opportunities to another user.");
  await assertActiveUser(ownerUserId, input.workspaceId);
  if (input.supportingUserIds.length && !isAdmin(actor)) throw forbidden("Only an Admin can add supporting users to an opportunity.");
  await Promise.all(input.supportingUserIds.map((userId) => assertActiveUser(userId, input.workspaceId)));
  await validateSameWorkspaceRefs(actor, input.workspaceId, input.accountId, input.primaryContactId);
  if (input.sourceCampaignId) {
    const campaign = await getCampaign(actor, input.sourceCampaignId);
    if (campaign.workspaceId !== input.workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "The source campaign must belong to the selected workspace.");
  }
  const ref = col("crmOpportunities").doc();
  const timestamp = now();
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, title: input.title.trim(), opportunityType: input.opportunityType,
    accountId: input.accountId ?? null, primaryContactId: input.primaryContactId ?? null,
    pipelineKey: "partnership" as const, stageKey: "prospecting", status: "open" as const,
    ownerUserId, supportingUserIds: [...new Set(input.supportingUserIds)], expectedValue: input.expectedValue ?? null,
    currency: input.currency ?? null, contributionDescription: clean(input.contributionDescription) ?? null,
    expectedDecisionAt: dateTs(input.expectedDecisionAt), nextStep: clean(input.nextStep) ?? null,
    outcomeReason: null, sourceCampaignId: input.sourceCampaignId ?? null,
    createdBy: actor.uid, updatedBy: actor.uid, createdAt: timestamp, updatedAt: timestamp, stageChangedAt: timestamp,
    schemaVersion: SCHEMA_VERSION,
  };
  await adminDb().runTransaction(async (tx) => {
    tx.create(ref, data);
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.opportunity_created", resourceType: "crmOpportunity", resourceId: ref.id, workspaceId: input.workspaceId, subjectUserIds: [ownerUserId], after: { title: data.title, opportunityType: data.opportunityType, stageKey: data.stageKey }, requestId });
  });
  return ref.id;
}

export async function updateCrmOpportunity(actor: Actor, id: string, input: {
  title?: string; opportunityType?: CrmOpportunity["opportunityType"]; accountId?: string | null; primaryContactId?: string | null;
  ownerUserId?: string; supportingUserIds?: string[]; expectedValue?: number | null; currency?: string | null;
  contributionDescription?: string | null; expectedDecisionAt?: string | null; nextStep?: string | null; sourceCampaignId?: string | null;
  stageKey?: PartnershipStageKey; outcomeReason?: string | null;
}, requestId: string): Promise<void> {
  const before = await getOpportunity(actor, id);
  if (input.ownerUserId && !isAdmin(actor)) throw forbidden("Only an Admin can reassign an opportunity.");
  if (input.ownerUserId) await assertActiveUser(input.ownerUserId, before.workspaceId);
  if (input.supportingUserIds !== undefined && !isAdmin(actor)) throw forbidden("Only an Admin can change supporting users on an opportunity.");
  if (input.supportingUserIds) await Promise.all(input.supportingUserIds.map((userId) => assertActiveUser(userId, before.workspaceId)));
  await validateSameWorkspaceRefs(actor, before.workspaceId, input.accountId === undefined ? before.accountId : input.accountId, input.primaryContactId === undefined ? before.primaryContactId : input.primaryContactId);
  if (input.sourceCampaignId) {
    const campaign = await getCampaign(actor, input.sourceCampaignId);
    if (campaign.workspaceId !== before.workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "The source campaign must belong to the same workspace.");
  }
  const nextStage = input.stageKey ?? before.stageKey;
  const nextStatus = partnershipStatusForStage(nextStage);
  const outcomeReason = input.outcomeReason === undefined ? before.outcomeReason : clean(input.outcomeReason);
  if ((nextStatus === "won" || nextStatus === "lost") && !outcomeReason) throw new ApiError(422, "outcome_reason_required", "Add an outcome reason when marking an opportunity Won or Lost.");
  const patch: Record<string, unknown> = { updatedBy: actor.uid, updatedAt: now() };
  for (const key of ["title", "opportunityType", "accountId", "primaryContactId", "ownerUserId", "supportingUserIds", "expectedValue", "currency", "contributionDescription", "expectedDecisionAt", "nextStep", "sourceCampaignId", "outcomeReason"] as const) {
    if (!(key in input)) continue;
    const value = input[key];
    if (key === "supportingUserIds") patch[key] = [...new Set(value as string[])];
    else if (key === "expectedDecisionAt") patch[key] = value ? dateTs(value as string) : null;
    else if (["title", "contributionDescription", "nextStep", "outcomeReason"].includes(key)) patch[key] = clean(value as string | null | undefined) ?? null;
    else patch[key] = value ?? null;
  }
  patch.stageKey = nextStage;
  patch.status = nextStatus;
  if (nextStage !== before.stageKey) patch.stageChangedAt = now();
  await adminDb().runTransaction(async (tx) => {
    const current = await tx.get(col("crmOpportunities").doc(id));
    if (!current.exists || current.data()?.organizationId !== org()) throw notFound("CRM opportunity not found.");
    tx.update(current.ref, patch);
    if (nextStage !== before.stageKey) {
      const activityRef = col("crmActivities").doc();
      tx.create(activityRef, activityRecord({ workspaceId: before.workspaceId, actorUserId: actor.uid, activityType: "stage_changed", channel: "internal", direction: "internal", occurredAt: new Date().toISOString(), summary: `Opportunity moved from ${before.stageKey} to ${nextStage}.`, outcome: clean(outcomeReason), accountId: before.accountId, contactId: before.primaryContactId, opportunityId: id, requestId }));
    }
    writeAudit(tx, { actorUserId: actor.uid, action: nextStage !== before.stageKey ? "crm.opportunity_stage_changed" : "crm.opportunity_updated", resourceType: "crmOpportunity", resourceId: id, workspaceId: before.workspaceId, subjectUserIds: [before.ownerUserId, input.ownerUserId ?? before.ownerUserId], before: { stageKey: before.stageKey, status: before.status, ownerUserId: before.ownerUserId }, after: { stageKey: nextStage, status: nextStatus, ownerUserId: input.ownerUserId ?? before.ownerUserId }, requestId });
  });
}

export async function createCrmCampaign(actor: Actor, input: {
  workspaceId: string; name: string; objective: string; campaignType: CrmCampaign["campaignType"]; channel: CrmCampaign["channel"];
  ownerUserId?: string; workstreamId?: string; teamId?: string; startAt?: string; endAt?: string; tags: string[];
}, requestId: string): Promise<string> {
  if (actor.role === "member") throw forbidden("Team Members can work on campaigns assigned to them but cannot create campaigns.");
  await assertWorkspace(actor, input.workspaceId);
  const ownerUserId = isAdmin(actor) ? (input.ownerUserId ?? actor.uid) : actor.uid;
  if (input.ownerUserId && !isAdmin(actor)) throw forbidden("Only an Admin can assign campaigns to another user.");
  await assertActiveUser(ownerUserId, input.workspaceId);
  const actorScope = isAdmin(actor) ? null : await getScope(actor.uid);
  if (input.workstreamId) {
    const stream = await col("workstreams").doc(input.workstreamId).get();
    if (!stream.exists || stream.data()?.organizationId !== org() || stream.data()?.workspaceId !== input.workspaceId || stream.data()?.status !== "active") throw new ApiError(422, "invalid_campaign_workstream", "Choose an active workstream in this workspace.");
    if (actorScope && !actorScope.leadWorkstreamIds.has(input.workstreamId)) throw forbidden("The selected workstream is outside your lead scope.");
  }
  if (input.teamId) {
    const team = await col("teams").doc(input.teamId).get();
    if (!team.exists || team.data()?.organizationId !== org() || team.data()?.workspaceId !== input.workspaceId || team.data()?.status !== "active") throw new ApiError(422, "invalid_campaign_team", "Choose an active team in this workspace.");
    if (actorScope && !actorScope.leadTeamIds.has(input.teamId) && !actorScope.teamIdsViaLedWorkstreams.has(input.teamId)) throw forbidden("The selected team is outside your lead scope.");
  }
  const ref = col("crmCampaigns").doc();
  const timestamp = now();
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, name: input.name.trim(), objective: input.objective.trim(),
    campaignType: input.campaignType, channel: input.channel, ownerUserId, workstreamId: input.workstreamId ?? null,
    teamId: input.teamId ?? null, startAt: dateTs(input.startAt), endAt: dateTs(input.endAt),
    status: "draft" as const, tags: [...new Set(input.tags)], createdBy: actor.uid, updatedBy: actor.uid,
    createdAt: timestamp, updatedAt: timestamp, schemaVersion: SCHEMA_VERSION,
  };
  await adminDb().runTransaction(async (tx) => {
    tx.create(ref, data);
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.campaign_created", resourceType: "crmCampaign", resourceId: ref.id, workspaceId: input.workspaceId, subjectUserIds: [ownerUserId], after: { name: data.name, campaignType: data.campaignType, channel: data.channel }, requestId });
  });
  return ref.id;
}

export async function updateCrmCampaign(actor: Actor, id: string, input: {
  name?: string; objective?: string; status?: CrmCampaign["status"]; startAt?: string | null; endAt?: string | null; tags?: string[];
}, requestId: string): Promise<void> {
  const before = await getCampaign(actor, id);
  if (!isAdmin(actor) && before.ownerUserId !== actor.uid) throw forbidden("Only the campaign owner or an Admin can change campaign settings.");
  const startAt = input.startAt === undefined ? before.startAt : input.startAt ?? undefined;
  const endAt = input.endAt === undefined ? before.endAt : input.endAt ?? undefined;
  if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) throw new ApiError(422, "invalid_campaign_dates", "Campaign end must be on or after its start.");
  const patch: Record<string, unknown> = { updatedBy: actor.uid, updatedAt: now() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.objective !== undefined) patch.objective = input.objective.trim();
  if (input.status !== undefined) patch.status = input.status;
  if (input.startAt !== undefined) patch.startAt = input.startAt ? dateTs(input.startAt) : FieldValue.delete();
  if (input.endAt !== undefined) patch.endAt = input.endAt ? dateTs(input.endAt) : FieldValue.delete();
  if (input.tags !== undefined) patch.tags = [...new Set(input.tags)];
  await adminDb().runTransaction(async (tx) => {
    const ref = col("crmCampaigns").doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("CRM campaign not found.");
    tx.update(ref, patch);
    writeAudit(tx, { actorUserId: actor.uid, action: input.status ? "crm.campaign_status_changed" : "crm.campaign_updated", resourceType: "crmCampaign", resourceId: id, workspaceId: before.workspaceId, subjectUserIds: [before.ownerUserId], before: { status: before.status }, after: { status: input.status ?? before.status }, requestId });
  });
}

export async function addCrmCampaignMember(actor: Actor, campaignId: string, input: { contactId: string; assignedToUserId?: string }, requestId: string): Promise<string> {
  const campaign = await getCampaign(actor, campaignId);
  if (campaign.status !== "active") throw conflict("crm_campaign_not_active", "Only active campaigns can accept new contacts.");
  if (!isAdmin(actor) && campaign.ownerUserId !== actor.uid) throw forbidden("Only the campaign owner or an Admin can enrol contacts.");
  const contact = await getContact(actor, input.contactId);
  if (contact.workspaceId !== campaign.workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "The contact must belong to the campaign workspace.");
  if (contact.doNotContact) throw new ApiError(422, "contact_do_not_contact", "This contact has a do-not-contact restriction and cannot be enrolled for outreach.");
  const assignedToUserId = isAdmin(actor) ? (input.assignedToUserId ?? campaign.ownerUserId) : actor.uid;
  if (input.assignedToUserId && !isAdmin(actor)) throw forbidden("Only an Admin can assign a campaign contact to another user.");
  await assertActiveUser(assignedToUserId, campaign.workspaceId);
  const id = crmCampaignMemberDocumentId(campaignId, contact.id);
  const ref = col("crmCampaignMembers").doc(id);
  const activityRef = col("crmActivities").doc();
  const occurredAt = new Date().toISOString();
  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) throw conflict("crm_contact_already_enrolled", "This contact is already enrolled in the campaign.");
    tx.create(ref, {
      organizationId: org(), workspaceId: campaign.workspaceId, campaignId, contactId: contact.id,
      assignedToUserId, stage: "researched", createdBy: actor.uid, updatedBy: actor.uid,
      createdAt: now(), updatedAt: now(),
    });
    tx.create(activityRef, activityRecord({ workspaceId: campaign.workspaceId, actorUserId: actor.uid, activityType: "note", channel: "internal", direction: "internal", occurredAt, summary: `Enrolled ${contact.displayName} in campaign ${campaign.name}.`, accountId: contact.accountId, contactId: contact.id, campaignId, campaignMemberId: id, requestId }));
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.campaign_contact_enrolled", resourceType: "crmCampaignMember", resourceId: id, workspaceId: campaign.workspaceId, subjectUserIds: [assignedToUserId], after: { campaignId, contactId: contact.id, assignedToUserId }, requestId });
  });
  return id;
}

export async function updateCrmCampaignMember(actor: Actor, id: string, input: {
  stage?: CrmCampaignMember["stage"]; assignedToUserId?: string; nextFollowUpAt?: string | null; linkedFollowUpTaskId?: string | null; outcomeReason?: string | null;
}, requestId: string): Promise<void> {
  const { member, campaign } = await getCampaignMember(actor, id);
  if (!isAdmin(actor) && member.assignedToUserId !== actor.uid && campaign.ownerUserId !== actor.uid) throw forbidden("This campaign contact is not assigned to you.");
  if (input.assignedToUserId && !isAdmin(actor)) throw forbidden("Only an Admin can reassign campaign contacts.");
  if (input.assignedToUserId) await assertActiveUser(input.assignedToUserId, campaign.workspaceId);
  const linkedTaskId = input.linkedFollowUpTaskId === undefined ? member.linkedFollowUpTaskId : input.linkedFollowUpTaskId ?? undefined;
  if (linkedTaskId) {
    const taskSnap = await col("tasks").doc(linkedTaskId).get();
    if (!taskSnap.exists) throw new ApiError(422, "invalid_follow_up_task", "Choose an active task in the same workspace.");
    const task = fromDoc<Task>(taskSnap);
    const expectedOwner = input.assignedToUserId ?? member.assignedToUserId;
    if (task.organizationId !== org() || task.workspaceId !== campaign.workspaceId || !isAutomationTaskOpen(task) || !await canAccessTask(actor, task) || (task.accountableUserId !== expectedOwner && !task.collaboratorUserIds.includes(expectedOwner))) {
      throw new ApiError(422, "invalid_follow_up_task", "The linked task must be open, in this workspace, accessible to you, and assigned to or shared with the campaign contact owner.");
    }
  }
  const contactSnap = await col("crmContacts").doc(member.contactId).get();
  if (!contactSnap.exists || contactSnap.data()?.organizationId !== org() || contactSnap.data()?.status !== "active") throw notFound("CRM contact not found.");
  const contact = fromDoc<CrmContact>(contactSnap);
  if (contact.doNotContact && input.stage && !["do_not_contact", "not_interested"].includes(input.stage)) throw new ApiError(422, "contact_do_not_contact", "A do-not-contact contact cannot move into an outreach stage.");
  if (input.nextFollowUpAt && ["converted", "not_interested", "do_not_contact"].includes(input.stage ?? member.stage)) throw new ApiError(422, "follow_up_not_allowed", "A follow-up cannot be scheduled for a closed or restricted campaign contact.");
  const patch: Record<string, unknown> = { updatedBy: actor.uid, updatedAt: now() };
  if (input.stage !== undefined) patch.stage = input.stage;
  if (input.assignedToUserId !== undefined) patch.assignedToUserId = input.assignedToUserId;
  if (input.nextFollowUpAt !== undefined) patch.nextFollowUpAt = input.nextFollowUpAt ? dateTs(input.nextFollowUpAt) : FieldValue.delete();
  if (input.linkedFollowUpTaskId !== undefined) patch.linkedFollowUpTaskId = input.linkedFollowUpTaskId || FieldValue.delete();
  if (input.outcomeReason !== undefined) patch.outcomeReason = clean(input.outcomeReason) ?? null;
  if (input.stage === "converted") patch.convertedAt = now();
  if (input.stage === "replied") patch.lastInteractionAt = now();
  if (input.stage && ["converted", "not_interested", "do_not_contact"].includes(input.stage)) patch.nextFollowUpAt = FieldValue.delete();
  await adminDb().runTransaction(async (tx) => {
    const ref = col("crmCampaignMembers").doc(id);
    const contactRef = col("crmContacts").doc(member.contactId);
    const [snap, currentContact] = await Promise.all([tx.get(ref), tx.get(contactRef)]);
    if (!snap.exists || snap.data()?.organizationId !== org() || !currentContact.exists || currentContact.data()?.organizationId !== org()) throw notFound("Campaign contact not found.");
    const nextStage = input.stage ?? member.stage;
    if (currentContact.data()?.doNotContact === true && !["do_not_contact", "not_interested"].includes(nextStage)) {
      throw new ApiError(422, "contact_do_not_contact", "A do-not-contact contact cannot move into an outreach stage.");
    }
    tx.update(ref, patch);
    if (input.stage === "do_not_contact" && currentContact.data()?.doNotContact !== true) {
      tx.update(contactRef, { doNotContact: true, doNotContactReason: "campaign_contact_opt_out", doNotContactSetBy: actor.uid, doNotContactSetAt: now(), updatedBy: actor.uid, updatedAt: now() });
    }
    if (input.stage && input.stage !== member.stage) {
      const activityRef = col("crmActivities").doc();
      const activityType: CrmActivity["activityType"] = input.stage === "replied" ? "reply_received" : "stage_changed";
      tx.create(activityRef, activityRecord({ workspaceId: campaign.workspaceId, actorUserId: actor.uid, activityType, channel: "internal", direction: "internal", occurredAt: new Date().toISOString(), summary: `Campaign contact moved from ${member.stage} to ${input.stage}.`, contactId: member.contactId, accountId: contact.accountId, campaignId: campaign.id, campaignMemberId: id, requestId }));
    }
    writeAudit(tx, { actorUserId: actor.uid, action: input.stage === "do_not_contact" ? "crm.campaign_member_do_not_contact" : "crm.campaign_member_updated", resourceType: "crmCampaignMember", resourceId: id, workspaceId: campaign.workspaceId, subjectUserIds: [member.assignedToUserId, input.assignedToUserId ?? member.assignedToUserId], before: { stage: member.stage, nextFollowUpAt: member.nextFollowUpAt ?? null, assignedToUserId: member.assignedToUserId }, after: { stage: input.stage ?? member.stage, nextFollowUpAt: input.nextFollowUpAt ?? member.nextFollowUpAt ?? null, assignedToUserId: input.assignedToUserId ?? member.assignedToUserId }, requestId });
  });
}

export async function createCrmActivity(actor: Actor, input: {
  campaignMemberId?: string; opportunityId?: string; contactId?: string; accountId?: string;
  activityType: CrmActivity["activityType"]; channel: CrmActivity["channel"]; direction?: CrmActivity["direction"];
  occurredAt?: string; summary: string; outcome?: string; correctsActivityId?: string; nextFollowUpAt?: string | null;
}, requestId: string): Promise<string> {
  let workspaceId = "";
  let campaignId: string | undefined;
  let contactId = input.contactId;
  let accountId = input.accountId;
  let campaignMember: CrmCampaignMember | undefined;
  let opportunity: CrmOpportunity | undefined;

  if (input.campaignMemberId) {
    const access = await getCampaignMember(actor, input.campaignMemberId);
    campaignMember = access.member;
    campaignId = access.campaign.id;
    workspaceId = access.campaign.workspaceId;
    contactId = campaignMember.contactId;
    const contactSnap = await col("crmContacts").doc(contactId).get();
    if (!contactSnap.exists || contactSnap.data()?.organizationId !== org() || contactSnap.data()?.status !== "active") throw notFound("CRM contact not found.");
    const contact = fromDoc<CrmContact>(contactSnap);
    if (contact.doNotContact && ["initial_outreach", "follow_up_sent", "call", "meeting"].includes(input.activityType)) throw new ApiError(422, "contact_do_not_contact", "Outreach activity cannot be logged for a do-not-contact contact.");
    accountId = contact.accountId;
  }
  if (input.opportunityId) {
    opportunity = await getOpportunity(actor, input.opportunityId);
    if (workspaceId && workspaceId !== opportunity.workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "All activity links must belong to the same workspace.");
    workspaceId = opportunity.workspaceId;
    accountId = accountId ?? opportunity.accountId;
    contactId = contactId ?? opportunity.primaryContactId;
  }
  if (input.contactId && !campaignMember) {
    const contact = await getContact(actor, input.contactId);
    if (workspaceId && workspaceId !== contact.workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "All activity links must belong to the same workspace.");
    workspaceId = contact.workspaceId;
    if (contact.doNotContact && ["initial_outreach", "follow_up_sent", "call", "meeting"].includes(input.activityType)) throw new ApiError(422, "contact_do_not_contact", "Outreach activity cannot be logged for a do-not-contact contact.");
    accountId = accountId ?? contact.accountId;
  }
  if (input.accountId && !campaignMember && !opportunity && !input.contactId) {
    const account = await getAccount(actor, input.accountId);
    workspaceId = account.workspaceId;
  } else if (accountId && !campaignMember && !opportunity && !input.contactId) {
    const account = await getAccount(actor, accountId);
    workspaceId = account.workspaceId;
  }
  if (!workspaceId) throw new ApiError(422, "crm_activity_target_required", "Link the activity to an accessible CRM record.");
  await assertWorkspace(actor, workspaceId);
  if (accountId) {
    if (campaignMember || (opportunity && !input.accountId)) {
      const accountSnap = await col("crmAccounts").doc(accountId).get();
      if (!accountSnap.exists || accountSnap.data()?.organizationId !== org() || accountSnap.data()?.workspaceId !== workspaceId || accountSnap.data()?.status !== "active") {
        throw new ApiError(422, "crm_workspace_mismatch", "The linked account must be active and belong to the same workspace.");
      }
    } else {
      const account = await getAccount(actor, accountId);
      if (account.workspaceId !== workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "The linked account must belong to the same workspace.");
    }
  }
  if (contactId && !campaignMember) {
    if (opportunity && !input.contactId) {
      const contactSnap = await col("crmContacts").doc(contactId).get();
      if (!contactSnap.exists || contactSnap.data()?.organizationId !== org() || contactSnap.data()?.workspaceId !== workspaceId || contactSnap.data()?.status !== "active") {
        throw new ApiError(422, "crm_workspace_mismatch", "The linked contact must be active and belong to the same workspace.");
      }
      if (contactSnap.data()?.doNotContact === true && ["initial_outreach", "follow_up_sent", "call", "meeting"].includes(input.activityType)) throw new ApiError(422, "contact_do_not_contact", "Outreach activity cannot be logged for a do-not-contact contact.");
    } else {
      const contact = await getContact(actor, contactId);
      if (contact.workspaceId !== workspaceId) throw new ApiError(422, "crm_workspace_mismatch", "The linked contact must belong to the same workspace.");
      if (contact.doNotContact && ["initial_outreach", "follow_up_sent", "call", "meeting"].includes(input.activityType)) throw new ApiError(422, "contact_do_not_contact", "Outreach activity cannot be logged for a do-not-contact contact.");
    }
  }
  if (input.correctsActivityId) {
    const prior = await col("crmActivities").doc(input.correctsActivityId).get();
    if (!prior.exists || prior.data()?.organizationId !== org() || prior.data()?.workspaceId !== workspaceId || (!isAdmin(actor) && prior.data()?.actorUserId !== actor.uid)) throw notFound("Activity to correct was not found.");
  }
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const ref = col("crmActivities").doc();
  const effectiveDirection = input.activityType === "reply_received"
    ? "inbound"
    : ["initial_outreach", "follow_up_sent"].includes(input.activityType) ? "outbound" : input.direction;
  const record = activityRecord({
    workspaceId, actorUserId: actor.uid, activityType: input.activityType, channel: input.channel,
    direction: effectiveDirection, occurredAt, summary: input.summary, outcome: input.outcome,
    accountId, contactId, opportunityId: input.opportunityId, campaignId, campaignMemberId: input.campaignMemberId,
    correctsActivityId: input.correctsActivityId, requestId,
  });
  await adminDb().runTransaction(async (tx) => {
    if (campaignMember) {
      const memberRef = col("crmCampaignMembers").doc(campaignMember.id);
      const memberSnap = await tx.get(memberRef);
      const contactRef = col("crmContacts").doc(campaignMember.contactId);
      const contactSnap = await tx.get(contactRef);
      if (!memberSnap.exists || memberSnap.data()?.organizationId !== org() || !contactSnap.exists || contactSnap.data()?.doNotContact === true) {
        if (["initial_outreach", "follow_up_sent", "call", "meeting"].includes(input.activityType)) throw new ApiError(422, "contact_do_not_contact", "This contact is restricted from outreach.");
        if (!memberSnap.exists || !contactSnap.exists) throw notFound("Campaign contact not found.");
      }
      const memberPatch: Record<string, unknown> = { lastInteractionAt: tsFromMs(Date.parse(occurredAt)), updatedBy: actor.uid, updatedAt: now() };
      if (["initial_outreach", "follow_up_sent"].includes(input.activityType)) {
        memberPatch.stage = "contacted";
        if (!memberSnap.data()?.firstContactAt) memberPatch.firstContactAt = tsFromMs(Date.parse(occurredAt));
      } else if (input.activityType === "reply_received") {
        memberPatch.stage = "replied";
      } else if (input.activityType === "qualified") {
        memberPatch.stage = "qualified";
      }
      if (input.nextFollowUpAt !== undefined) memberPatch.nextFollowUpAt = input.nextFollowUpAt ? dateTs(input.nextFollowUpAt) : FieldValue.delete();
      else if (["initial_outreach", "follow_up_sent", "reply_received"].includes(input.activityType)) memberPatch.nextFollowUpAt = FieldValue.delete();
      tx.update(memberRef, memberPatch);
    }
    tx.create(ref, record);
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.activity_logged", resourceType: "crmActivity", resourceId: ref.id, workspaceId, subjectUserIds: campaignMember ? [campaignMember.assignedToUserId] : opportunity ? [opportunity.ownerUserId] : [], after: { activityType: input.activityType, channel: input.channel, direction: effectiveDirection ?? "internal", campaignMemberId: input.campaignMemberId ?? null, opportunityId: input.opportunityId ?? null }, requestId });
  });
  return ref.id;
}

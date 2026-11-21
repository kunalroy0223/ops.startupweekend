import { createHash } from "node:crypto";

export const PARTNERSHIP_PIPELINE_STAGES = [
  { key: "prospecting", label: "Prospecting", status: "open" },
  { key: "qualified", label: "Qualified", status: "open" },
  { key: "discovery", label: "Discovery", status: "open" },
  { key: "proposal", label: "Proposal", status: "open" },
  { key: "negotiation", label: "Negotiation", status: "open" },
  { key: "nurture", label: "Nurture", status: "nurture" },
  { key: "won", label: "Won", status: "won" },
  { key: "lost", label: "Lost", status: "lost" },
] as const;

export type PartnershipStageKey = (typeof PARTNERSHIP_PIPELINE_STAGES)[number]["key"];
export type PartnershipStageStatus = "open" | "won" | "lost" | "nurture";

export const CRM_CAMPAIGN_MEMBER_STAGES = [
  "researched",
  "qualified",
  "ready_to_contact",
  "contacted",
  "replied",
  "interested",
  "converted",
  "nurture",
  "not_interested",
  "do_not_contact",
] as const;
export type CrmCampaignMemberStage = (typeof CRM_CAMPAIGN_MEMBER_STAGES)[number];

export const CRM_CAMPAIGN_MEMBER_TERMINAL_STAGES = new Set<CrmCampaignMemberStage>([
  "converted",
  "not_interested",
  "do_not_contact",
]);

export function partnershipStatusForStage(stageKey: string): PartnershipStageStatus {
  const stage = PARTNERSHIP_PIPELINE_STAGES.find((item) => item.key === stageKey);
  if (!stage) throw new Error("invalid_partnership_stage");
  return stage.status;
}

export function isPartnershipStage(value: string): value is PartnershipStageKey {
  return PARTNERSHIP_PIPELINE_STAGES.some((stage) => stage.key === value);
}

export function isCrmCampaignMemberStage(value: string): value is CrmCampaignMemberStage {
  return (CRM_CAMPAIGN_MEMBER_STAGES as readonly string[]).includes(value);
}

export function crmCampaignMemberDocumentId(campaignId: string, contactId: string): string {
  return createHash("sha256").update(`${campaignId}\u0000${contactId}`).digest("hex");
}

export function crmFollowUpOccurrenceKey(nextFollowUpAt: string, nowMs = Date.parse(nextFollowUpAt), repeatHours = 24): string {
  const timestamp = Date.parse(nextFollowUpAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs) || !Number.isFinite(repeatHours) || repeatHours < 1) throw new Error("invalid_follow_up_at");
  const repeatWindowMs = repeatHours * 60 * 60_000;
  const occurrence = Math.floor(Math.max(0, nowMs - timestamp) / repeatWindowMs);
  return `followup:${new Date(timestamp).toISOString()}:${occurrence}`;
}

export function crmReplyWaitingOccurrenceKey(lastInteractionAt: string, nowMs: number, waitHours: number): string {
  const repliedAt = Date.parse(lastInteractionAt);
  if (!Number.isFinite(repliedAt) || !Number.isFinite(nowMs) || waitHours < 1) throw new Error("invalid_reply_wait_occurrence");
  const intervalMs = waitHours * 60 * 60_000;
  const bucket = Math.floor((nowMs - repliedAt) / intervalMs);
  return `reply:${new Date(repliedAt).toISOString()}:${bucket}`;
}

export function isCrmFollowUpDue(nextFollowUpAt: string | undefined, nowMs: number): boolean {
  if (!nextFollowUpAt) return false;
  const value = Date.parse(nextFollowUpAt);
  return Number.isFinite(value) && value <= nowMs;
}

export function isCrmReplyWaiting(stage: string, lastInteractionAt: string | undefined, nowMs: number, waitHours: number): boolean {
  if (stage !== "replied" || !lastInteractionAt) return false;
  const value = Date.parse(lastInteractionAt);
  return Number.isFinite(value) && nowMs - value >= waitHours * 60 * 60_000;
}

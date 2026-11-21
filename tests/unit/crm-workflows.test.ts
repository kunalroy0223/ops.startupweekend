import { describe, expect, it } from "vitest";
import {
  CRM_CAMPAIGN_MEMBER_TERMINAL_STAGES,
  crmCampaignMemberDocumentId,
  crmFollowUpOccurrenceKey,
  crmReplyWaitingOccurrenceKey,
  isCrmCampaignMemberStage,
  isCrmFollowUpDue,
  isCrmReplyWaiting,
  partnershipStatusForStage,
} from "@/domain/crm-workflows";
import {
  crmActivityCreateSchema,
  crmCampaignCreateSchema,
  crmCampaignMemberUpdateSchema,
  crmOpportunityCreateSchema,
} from "@/domain/validation";

const now = Date.parse("2026-11-21T12:00:00.000Z");

describe("CRM partnership pipeline", () => {
  it("maps stage transitions to the corresponding opportunity status", () => {
    expect(partnershipStatusForStage("prospecting")).toBe("open");
    expect(partnershipStatusForStage("nurture")).toBe("nurture");
    expect(partnershipStatusForStage("won")).toBe("won");
    expect(partnershipStatusForStage("lost")).toBe("lost");
    expect(() => partnershipStatusForStage("unknown")).toThrow("invalid_partnership_stage");
  });

  it("validates opportunity creation without accepting unknown fields", () => {
    const input = { workspaceId: "workspace_1", title: "Annual sponsor partnership", opportunityType: "sponsorship" };
    expect(crmOpportunityCreateSchema.safeParse(input).success).toBe(true);
    expect(crmOpportunityCreateSchema.safeParse({ ...input, privileged: true }).success).toBe(false);
    expect(crmOpportunityCreateSchema.safeParse({ ...input, expectedValue: -10 }).success).toBe(false);
  });
});

describe("CRM campaign and outreach lifecycle", () => {
  it("validates campaign date ordering and campaign-member stages", () => {
    expect(crmCampaignCreateSchema.safeParse({
      workspaceId: "workspace_1",
      name: "Mentor outreach",
      objective: "Recruit mentors for the next cohort",
      campaignType: "mentor_acquisition",
      channel: "email",
      startAt: "2026-11-21T09:00:00.000Z",
      endAt: "2026-11-28T09:00:00.000Z",
    }).success).toBe(true);
    expect(crmCampaignCreateSchema.safeParse({
      workspaceId: "workspace_1", name: "Mentor outreach", objective: "Recruit mentors",
      campaignType: "mentor_acquisition", channel: "email",
      startAt: "2026-11-28T09:00:00.000Z", endAt: "2026-11-21T09:00:00.000Z",
    }).success).toBe(false);
    expect(isCrmCampaignMemberStage("contacted")).toBe(true);
    expect(isCrmCampaignMemberStage("untracked_stage")).toBe(false);
    expect([...CRM_CAMPAIGN_MEMBER_TERMINAL_STAGES]).toEqual(["converted", "not_interested", "do_not_contact"]);
  });

  it("creates stable, opaque campaign/contact membership IDs", () => {
    const first = crmCampaignMemberDocumentId("campaign_a", "contact_b");
    expect(first).toBe(crmCampaignMemberDocumentId("campaign_a", "contact_b"));
    expect(first).not.toBe(crmCampaignMemberDocumentId("campaign_a", "contact_c"));
    expect(first).not.toContain("campaign_a");
    expect(first).not.toContain("contact_b");
  });

  it("validates follow-up scheduling and task-link clearing", () => {
    expect(crmCampaignMemberUpdateSchema.safeParse({ nextFollowUpAt: "2026-11-22T09:00:00.000Z" }).success).toBe(true);
    expect(crmCampaignMemberUpdateSchema.safeParse({ linkedFollowUpTaskId: null }).success).toBe(true);
    expect(crmCampaignMemberUpdateSchema.safeParse({ nextFollowUpAt: "tomorrow" }).success).toBe(false);
  });

  it("uses stable reminder occurrences and enforces reminder thresholds", () => {
    const followUp = "2026-11-21T11:00:00.000Z";
    expect(isCrmFollowUpDue(followUp, now)).toBe(true);
    expect(isCrmFollowUpDue("2026-11-21T13:00:00.000Z", now)).toBe(false);
    expect(crmFollowUpOccurrenceKey(followUp)).toBe(crmFollowUpOccurrenceKey(followUp));
    expect(crmFollowUpOccurrenceKey(followUp, now, 24)).toBe("followup:2026-11-21T11:00:00.000Z:0");
    expect(crmFollowUpOccurrenceKey(followUp, Date.parse("2026-11-22T12:00:00.000Z"), 24)).toBe("followup:2026-11-21T11:00:00.000Z:1");

    const replyAt = "2026-11-20T11:00:00.000Z";
    expect(isCrmReplyWaiting("replied", replyAt, now, 24)).toBe(true);
    expect(isCrmReplyWaiting("contacted", replyAt, now, 24)).toBe(false);
    expect(isCrmReplyWaiting("replied", "2026-11-21T10:00:00.000Z", now, 24)).toBe(false);
    expect(crmReplyWaitingOccurrenceKey(replyAt, now, 24)).toBe("reply:2026-11-20T11:00:00.000Z:1");
  });

  it("requires activity history to be linked to a CRM record", () => {
    const base = { activityType: "note", channel: "internal", summary: "Discussed next steps" };
    expect(crmActivityCreateSchema.safeParse(base).success).toBe(false);
    expect(crmActivityCreateSchema.safeParse({ ...base, opportunityId: "opp_1" }).success).toBe(true);
    expect(crmActivityCreateSchema.safeParse({ ...base, campaignMemberId: "member_1", activityType: "correction" }).success).toBe(false);
    expect(crmActivityCreateSchema.safeParse({ ...base, campaignMemberId: "member_1", activityType: "correction", correctsActivityId: "activity_1" }).success).toBe(true);
  });
});

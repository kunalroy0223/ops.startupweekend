import { describe, expect, it } from "vitest";
import { AUTOMATION_RULES, isAutomationRuleKey, validateAutomationRuleConfig } from "@/server/automation/registry";
import { automationRunDocumentId } from "@/domain/automation";

describe("code-owned automation rule registry", () => {
  it("contains only the approved first-slice rule keys", () => {
    expect(Object.keys(AUTOMATION_RULES)).toEqual(["task_due_soon", "task_overdue", "crm_follow_up_due", "crm_reply_waiting"]);
    expect(isAutomationRuleKey("task_due_soon")).toBe(true);
    expect(isAutomationRuleKey("arbitrary_script")).toBe(false);
  });

  it("creates a deterministic run ID from the business occurrence, not worker time", () => {
    const identity = { ruleId: "rule-1", ruleKey: "task_due_soon", targetType: "task", targetId: "task-1", recipientUserId: "user-1", occurrenceKey: "2026-11-21T09:00:00+05:30" };
    expect(automationRunDocumentId(identity, "inhub")).toBe(automationRunDocumentId(identity, "inhub"));
    expect(automationRunDocumentId(identity, "inhub")).not.toBe(automationRunDocumentId({ ...identity, occurrenceKey: "2026-11-22T09:00:00+05:30" }, "inhub"));
    expect(automationRunDocumentId(identity, "inhub")).not.toBe(automationRunDocumentId(identity, "another-org"));
    expect(automationRunDocumentId(identity, "inhub")).not.toBe(automationRunDocumentId({ ...identity, workspaceId: "workspace-2" }, "inhub"));
  });

  it("enables the CRM workflow reminders with bounded configuration", () => {
    expect(AUTOMATION_RULES.crm_follow_up_due.executionAvailable).toBe(true);
    expect(AUTOMATION_RULES.crm_reply_waiting.executionAvailable).toBe(true);
    expect(validateAutomationRuleConfig("crm_follow_up_due", { repeatHours: 24 })).toEqual({ repeatHours: 24 });
    expect(validateAutomationRuleConfig("crm_reply_waiting", { waitHours: 24 })).toEqual({ waitHours: 24 });
    expect(() => validateAutomationRuleConfig("crm_follow_up_due", { repeatHours: 1 })).toThrow();
    expect(() => validateAutomationRuleConfig("crm_reply_waiting", { waitHours: 2 })).toThrow();
  });
  it("validates bounded rule configuration", () => {
    expect(validateAutomationRuleConfig("task_due_soon", { leadMinutes: 1_440 })).toEqual({ leadMinutes: 1_440 });
    expect(() => validateAutomationRuleConfig("task_due_soon", { leadMinutes: 0 })).toThrow();
    expect(() => validateAutomationRuleConfig("task_due_soon", { leadMinutes: 60, command: "fetch(url)" })).toThrow();
  });
});

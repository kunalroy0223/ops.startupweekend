import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, EVENT_CATALOGUE, EVENT_TYPES, isRetryableStatus, nextRetryDelayMs, resolveChannels } from "@/domain/events";

describe("notification channel policy", () => {
  it("covers the Module 1 event types", () => {
    for (const t of ["USER_INVITED", "USER_ROLE_CHANGED", "USER_TEAM_ASSIGNED", "USER_WORKSTREAM_ASSIGNED", "ACCOUNT_STATUS_CHANGED"]) expect(EVENT_TYPES).toContain(t);
  });
  it("registers Module 2 task notifications", () => {
    expect(EVENT_TYPES).toContain("TASK_ASSIGNED");
    expect(EVENT_TYPES).toContain("TASK_STATUS_CHANGED");
    expect(EVENT_CATALOGUE.TASK_ASSIGNED.module).toBe(2);
    expect(EVENT_CATALOGUE.TASK_COMMENTED.module).toBe(2);
    expect(resolveChannels("TASK_ASSIGNED", DEFAULT_PREFERENCES)).toEqual({ inApp: true, email: "immediate" });
  });
  it("registers Module 3 report lifecycle notifications", () => {
    for (const type of ["WORK_REPORT_SUBMITTED", "WORK_REPORT_APPROVED", "WORK_REPORT_NEEDS_REVISION"] as const) {
      expect(EVENT_TYPES).toContain(type);
      expect(EVENT_CATALOGUE[type].module).toBe(3);
      expect(resolveChannels(type, DEFAULT_PREFERENCES)).toEqual({ inApp: true, email: "immediate" });
    }
  });
  it("essential events ignore opt-outs", () => {
    const prefs = { ...DEFAULT_PREFERENCES, emailEnabled: false, inAppEnabled: false, deliveryMode: "off" as const, disabledEventTypes: ["USER_ROLE_CHANGED"] };
    expect(resolveChannels("USER_ROLE_CHANGED", prefs)).toEqual({ inApp: true, email: "immediate" });
    expect(EVENT_CATALOGUE.ACCOUNT_STATUS_CHANGED.essential).toBe(true);
  });
  it("optional events respect preferences", () => {
    expect(resolveChannels("USER_TEAM_ASSIGNED", DEFAULT_PREFERENCES)).toEqual({ inApp: true, email: "immediate" });
    expect(resolveChannels("USER_TEAM_ASSIGNED", { ...DEFAULT_PREFERENCES, disabledEventTypes: ["USER_TEAM_ASSIGNED"] })).toEqual({ inApp: false, email: "none" });
    expect(resolveChannels("USER_TEAM_ASSIGNED", { ...DEFAULT_PREFERENCES, deliveryMode: "daily_digest" })).toEqual({ inApp: true, email: "digest" });
    expect(resolveChannels("USER_TEAM_ASSIGNED", { ...DEFAULT_PREFERENCES, emailEnabled: false })).toMatchObject({ email: "none" });
  });
  it("invitations are email-only", () => {
    expect(resolveChannels("USER_INVITED", DEFAULT_PREFERENCES)).toEqual({ inApp: false, email: "immediate" });
  });
  it("retries back off and stop", () => {
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(2)).toBe(240_000);
    expect(nextRetryDelayMs(5)).toBeNull();
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(422)).toBe(false);
    expect(isRetryableStatus(undefined)).toBe(true);
  });
});

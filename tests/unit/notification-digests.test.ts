import { describe, expect, it } from "vitest";
import {
  dailyDigestScheduledAt,
  isDigestScheduleDue,
  localDateParts,
  notificationDigestDocumentId,
  notificationDigestItemDocumentId,
} from "@/domain/notifications";

describe("daily notification digest scheduling", () => {
  it("creates deterministic digest and item IDs", () => {
    const digestId = notificationDigestDocumentId("inhub", "user-1", "2026-11-21");
    expect(digestId).toBe(notificationDigestDocumentId("inhub", "user-1", "2026-11-21"));
    expect(digestId).not.toBe(notificationDigestDocumentId("inhub", "user-2", "2026-11-21"));
    expect(notificationDigestItemDocumentId("event-1", "user-1")).toBe(notificationDigestItemDocumentId("event-1", "user-1"));
    expect(notificationDigestItemDocumentId("event-1", "user-1")).not.toBe(notificationDigestItemDocumentId("event-2", "user-1"));
  });

  it("schedules the digest at 09:00 in the organisation timezone", () => {
    const scheduled = new Date(dailyDigestScheduledAt("2026-11-21", "Asia/Kolkata"));
    expect(localDateParts(scheduled, "Asia/Kolkata")).toMatchObject({ date: "2026-11-21", hour: 9, minute: 0 });
    expect(isDigestScheduleDue(new Date("2026-11-21T03:29:00.000Z"), "Asia/Kolkata")).toBe(false);
    expect(isDigestScheduleDue(new Date("2026-11-21T03:30:00.000Z"), "Asia/Kolkata")).toBe(true);
  });

  it("converts local digest time correctly for a daylight-saving timezone", () => {
    const scheduled = new Date(dailyDigestScheduledAt("2026-07-21", "America/New_York"));
    expect(localDateParts(scheduled, "America/New_York")).toMatchObject({ date: "2026-07-21", hour: 9, minute: 0 });
  });
});

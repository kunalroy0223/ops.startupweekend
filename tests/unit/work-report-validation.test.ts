import { describe, expect, it } from "vitest";
import { workReportCreateSchema, workReportEntrySchema, workReportReviewSchema } from "@/domain/validation";

describe("Module 3 work report validation", () => {
  it("accepts a valid reporting date and rejects impossible calendar dates", () => {
    expect(workReportCreateSchema.safeParse({ workspaceId: "ws_main", reportDate: "2026-11-20" }).success).toBe(true);
    expect(workReportCreateSchema.safeParse({ workspaceId: "ws_main", reportDate: "2026-02-30" }).success).toBe(false);
  });

  it("requires a meaningful work entry and bounds time spent", () => {
    const entry = { activityTitle: "Prepared launch assets", workCompleted: "Completed the campaign draft.", blockers: [], nextSteps: [], linkUrls: [] };
    expect(workReportEntrySchema.safeParse(entry).success).toBe(true);
    expect(workReportEntrySchema.safeParse({ ...entry, timeSpentMinutes: 1441 }).success).toBe(false);
    expect(workReportEntrySchema.safeParse({ ...entry, workCompleted: " " }).success).toBe(false);
    expect(workReportEntrySchema.safeParse({ ...entry, linkUrls: Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`) }).success).toBe(false);
    expect(workReportEntrySchema.safeParse({ ...entry, linkUrls: ["https://drive.google.com/document/d/example"] }).success).toBe(true);
    expect(workReportEntrySchema.safeParse({ ...entry, linkUrls: ["https://example.com/deliverable"] }).success).toBe(true);
    expect(workReportEntrySchema.safeParse({ ...entry, linkUrls: ["javascript:alert(1)"] }).success).toBe(false);
  });

  it("requires reviewer feedback when requesting a revision", () => {
    expect(workReportReviewSchema.safeParse({ decision: "approved" }).success).toBe(true);
    expect(workReportReviewSchema.safeParse({ decision: "needs_revision" }).success).toBe(false);
    expect(workReportReviewSchema.safeParse({ decision: "needs_revision", comment: "Please add the missing deliverable." }).success).toBe(true);
  });
});

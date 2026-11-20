import { describe, expect, it } from "vitest";
import { projectCreateSchema, taskCreateSchema, taskStatusSchema, taskUpdateSchema } from "@/domain/validation";

const task = {
  workspaceId: "ws_main",
  title: "Prepare launch campaign",
  accountableUserId: "user_asha",
  collaboratorUserIds: [],
  priority: "high",
  dependencyIds: [],
};

describe("Module 2 validation", () => {
  it("requires an accountable owner and supports optional team assignment", () => {
    expect(taskCreateSchema.safeParse(task).success).toBe(true);
    expect(taskCreateSchema.safeParse({ ...task, teamId: "team_marketing" }).success).toBe(true);
    const withoutOwner = { ...task };
    Reflect.deleteProperty(withoutOwner, "accountableUserId");
    expect(taskCreateSchema.safeParse(withoutOwner).success).toBe(false);
  });

  it("rejects invalid priority and oversized collaborator lists", () => {
    expect(taskCreateSchema.safeParse({ ...task, priority: "critical" }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ ...task, collaboratorUserIds: Array.from({ length: 21 }, (_, i) => `u${i}`) }).success).toBe(false);
  });

  it("validates project workspace and task status payloads", () => {
    expect(projectCreateSchema.safeParse({ workspaceId: "ws_main", name: "Website refresh" }).success).toBe(true);
    expect(taskStatusSchema.safeParse({ status: "in_review" }).success).toBe(true);
    expect(taskStatusSchema.safeParse({ status: "done" }).success).toBe(false);
  });

  it("validates bounded reference links and dependency lists", () => {
    expect(taskCreateSchema.safeParse({ ...task, referenceLinks: ["https://example.com/spec"] }).success).toBe(true);
    expect(taskCreateSchema.safeParse({ ...task, referenceLinks: ["not-a-url"] }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ ...task, referenceLinks: ["javascript:alert(1)"] }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ ...task, dependencyIds: Array.from({ length: 21 }, (_, i) => `t${i}`) }).success).toBe(false);
  });

  it("does not accept privileged task fields in a normal edit", () => {
    expect(taskUpdateSchema.safeParse({ status: "completed" }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ accountableUserId: "user_asha" }).success).toBe(true);
  });
});

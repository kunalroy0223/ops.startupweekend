import { describe, expect, it } from "vitest";
import { invitationAcceptSchema, invitationCreateSchema, notificationPreferencesSchema, passwordSchema, profileSelfUpdateSchema, slugify } from "@/domain/validation";

describe("input validation", () => {
  it("normalises invitation email and rejects Admin invitations", () => {
    expect(invitationCreateSchema.parse({ email: "  Asha@Inspiria.EDU.in ", intendedRole: "lead", workspaceId: "ws1" }).email).toBe("asha@inspiria.edu.in");
    expect(invitationCreateSchema.safeParse({ email: "a@b.in", intendedRole: "admin", workspaceId: "ws1" }).success).toBe(false);
    expect(invitationCreateSchema.safeParse({ email: "a@b.in", intendedRole: "member", workspaceId: "../x" }).success).toBe(false);
  });
  it("enforces password strength", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("letters-and-123").success).toBe(true);
  });
  it("rejects malformed invitation tokens", () => {
    expect(invitationAcceptSchema.safeParse({ token: "abc", displayName: "Asha", password: "letters-and-123" }).success).toBe(false);
  });
  it("self profile updates cannot carry role, status or email", () => {
    expect(profileSelfUpdateSchema.safeParse({ displayName: "Asha", role: "admin" }).success).toBe(false);
    expect(profileSelfUpdateSchema.safeParse({ status: "active" }).success).toBe(false);
    expect(profileSelfUpdateSchema.safeParse({ email: "x@y.in" }).success).toBe(false);
  });
  it("validates preferences", () => {
    expect(notificationPreferencesSchema.safeParse({ inAppEnabled: true, emailEnabled: true, deliveryMode: "hourly", disabledEventTypes: [] }).success).toBe(false);
  });
  it("slugifies names", () => {
    expect(slugify("  Partnerships & Outreach ")).toBe("partnerships-outreach");
  });
});

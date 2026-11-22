import { describe, expect, it } from "vitest";
import { navFor, type Actor } from "@/domain/authz";

function actor(role: Actor["role"]): Actor {
  return {
    uid: `${role}-user`, organizationId: "inhub", role, status: "active",
    email: `${role}@example.test`, displayName: role,
  };
}

describe("Module 7 Analytics navigation", () => {
  it("exposes scoped analytics to Admin, Lead and Team Member", () => {
    for (const role of ["admin", "lead", "member"] as const) {
      expect(navFor(actor(role))).toContain("analytics");
    }
  });

  it("does not expose released navigation to inactive accounts", () => {
    const inactive = { ...actor("member"), status: "suspended" as const };
    expect(navFor(inactive)).toEqual([]);
  });
});


describe("Modules 10–12 navigation", () => {
  it("exposes events and resources to all active roles", () => {
    for (const role of ["admin", "lead", "member"] as const) {
      expect(navFor(actor(role))).toContain("events");
      expect(navFor(actor(role))).toContain("resources");
    }
  });

  it("keeps governance navigation Admin-only", () => {
    expect(navFor(actor("admin"))).toContain("governance");
    expect(navFor(actor("lead"))).not.toContain("governance");
    expect(navFor(actor("member"))).not.toContain("governance");
  });
});

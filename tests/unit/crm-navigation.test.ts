import { describe, expect, it } from "vitest";
import { navFor } from "@/domain/authz";
import type { Actor } from "@/domain/authz";

function actor(role: Actor["role"]): Actor {
  return {
    uid: `${role}-user`,
    organizationId: "inhub",
    role,
    status: "active",
    email: `${role}@example.test`,
    displayName: role,
  };
}

describe("CRM and Automation navigation", () => {
  it("shows CRM to all active roles", () => {
    for (const role of ["admin", "lead", "member"] as const) {
      expect(navFor(actor(role))).toContain("crm");
    }
  });

  it("shows Automation only to Admin", () => {
    expect(navFor(actor("admin"))).toContain("automation");
    expect(navFor(actor("lead"))).not.toContain("automation");
    expect(navFor(actor("member"))).not.toContain("automation");
  });
});

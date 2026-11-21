import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  doc: vi.fn(),
  col: vi.fn(),
  forbidden: vi.fn((message?: string) => new Error(message ?? "forbidden")),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ col: mocks.col }));
vi.mock("@/server/http", () => ({ forbidden: mocks.forbidden }));

import { assertActorInOrganization, assertActorProfile } from "@/server/services/actor-access";
import type { Actor } from "@/domain/authz";

const admin: Actor = {
  uid: "admin-1",
  organizationId: "inhub",
  role: "admin",
  status: "active",
  email: "admin@example.com",
  displayName: "Admin",
};

const profile = (overrides: Partial<{ organizationId: string; role: Actor["role"]; status: Actor["status"] }> = {}) => ({
  organizationId: "inhub",
  role: "admin",
  status: "active",
  ...overrides,
});

describe("CRM and automation actor access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ exists: true, data: () => profile() });
    mocks.doc.mockReturnValue({ get: mocks.getUser });
    mocks.col.mockReturnValue({ doc: mocks.doc });
  });

  it("accepts a current active user whose persisted profile matches the organisation and role", async () => {
    await expect(assertActorInOrganization(admin, "inhub")).resolves.toBeUndefined();
    expect(mocks.col).toHaveBeenCalledWith("users");
    expect(mocks.doc).toHaveBeenCalledWith(admin.uid);
  });

  it("rejects an actor from another organisation", async () => {
    await expect(assertActorInOrganization(admin, "another-org")).rejects.toThrow();
  });

  it("rejects a missing, inactive or role-mismatched persisted profile", () => {
    expect(() => assertActorProfile(admin, "inhub", undefined)).toThrow();
    expect(() => assertActorProfile(admin, "inhub", profile({ status: "suspended" }))).toThrow();
    expect(() => assertActorProfile(admin, "inhub", profile({ role: "lead" }))).toThrow();
    expect(() => assertActorProfile(admin, "inhub", profile({ organizationId: "another-org" }))).toThrow();
  });

  it("rejects a missing user document before CRM or automation access", async () => {
    mocks.getUser.mockResolvedValue({ exists: false, data: () => undefined });
    await expect(assertActorInOrganization(admin, "inhub")).rejects.toThrow();
  });
});

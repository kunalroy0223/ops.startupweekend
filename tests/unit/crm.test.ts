import { describe, expect, it } from "vitest";
import { crmIdentityKeyId, diffCrmIdentityKeys, normalizeCrmEmail, normalizeCrmName, normalizeInstagramHandle } from "@/domain/crm";
import { crmAccountCreateSchema, crmAccountUpdateSchema, crmContactCreateSchema, crmDoNotContactSchema } from "@/domain/validation";

describe("CRM identity normalisation", () => {
  it("normalises names and email addresses consistently", () => {
    expect(normalizeCrmName("  Example   STARTUP  ")).toBe("example startup");
    expect(normalizeCrmEmail("  HELLO@Example.COM ")).toBe("hello@example.com");
  });

  it("normalises Instagram handles without assuming a real person's identity", () => {
    expect(normalizeInstagramHandle(" @Darjeeling.Brand ")).toBe("darjeeling.brand");
    expect(normalizeInstagramHandle("@CREATOR_01")).toBe("creator_01");
  });

  it("creates stable opaque workspace-scoped identity keys", () => {
    const first = crmIdentityKeyId("inhub", "ws1", "instagram_handle", "brand");
    expect(first).toBe(crmIdentityKeyId("inhub", "ws1", "instagram_handle", "brand"));
    expect(first).not.toBe(crmIdentityKeyId("inhub", "ws2", "instagram_handle", "brand"));
    expect(first).not.toContain("brand");
  });

  it("computes identity-key additions and removals when contact identities change", () => {
    const oldEmail = { id: crmIdentityKeyId("inhub", "ws1", "email", "old@example.com"), identityType: "email" as const };
    const newEmail = { id: crmIdentityKeyId("inhub", "ws1", "email", "new@example.com"), identityType: "email" as const };
    const oldHandle = { id: crmIdentityKeyId("inhub", "ws1", "instagram_handle", "oldbrand"), identityType: "instagram_handle" as const };
    const newHandle = { id: crmIdentityKeyId("inhub", "ws1", "instagram_handle", "newbrand"), identityType: "instagram_handle" as const };

    expect(diffCrmIdentityKeys([oldEmail, oldHandle], [newEmail, newHandle])).toEqual({
      toCreate: [newEmail, newHandle],
      toDelete: [oldEmail, oldHandle],
    });
  });

  it("does not remove identity keys that remain unchanged", () => {
    const email = { id: crmIdentityKeyId("inhub", "ws1", "email", "hello@example.com"), identityType: "email" as const };
    const handle = { id: crmIdentityKeyId("inhub", "ws1", "instagram_handle", "brand"), identityType: "instagram_handle" as const };
    expect(diffCrmIdentityKeys([email, handle], [email])).toEqual({
      toCreate: [],
      toDelete: [handle],
    });
    expect(diffCrmIdentityKeys([email], [email])).toEqual({ toCreate: [], toDelete: [] });
    expect(diffCrmIdentityKeys([email, handle], [])).toEqual({ toCreate: [], toDelete: [email, handle] });
  });
});

describe("CRM request validation", () => {
  it("requires a workspace and a valid account name", () => {
    expect(crmAccountCreateSchema.safeParse({ workspaceId: "ws1", name: "Acme Ltd", accountType: "company" }).success).toBe(true);
    expect(crmAccountCreateSchema.safeParse({ workspaceId: "ws1", name: "x", accountType: "company" }).success).toBe(false);
  });

  it("allows clearing optional account fields explicitly", () => {
    expect(crmAccountUpdateSchema.safeParse({ website: null, industry: null }).success).toBe(true);
  });

  it("allows a social-profile contact without an email address", () => {
    expect(crmContactCreateSchema.safeParse({ workspaceId: "ws1", recordType: "creator_profile", displayName: "Creator", instagramHandle: "@creator" }).success).toBe(true);
  });

  it("rejects malformed Instagram handles instead of silently changing them", () => {
    expect(crmContactCreateSchema.safeParse({ workspaceId: "ws1", recordType: "creator_profile", displayName: "Creator", instagramHandle: "@creator_01" }).success).toBe(true);
    expect(crmContactCreateSchema.safeParse({ workspaceId: "ws1", recordType: "creator_profile", displayName: "Creator", instagramHandle: "@creator 01" }).success).toBe(false);
    expect(crmContactCreateSchema.safeParse({ workspaceId: "ws1", recordType: "creator_profile", displayName: "Creator", instagramHandle: "@@creator" }).success).toBe(false);
  });

  it("requires a reason when clearing do-not-contact", () => {
    expect(crmDoNotContactSchema.safeParse({ doNotContact: true }).success).toBe(true);
    expect(crmDoNotContactSchema.safeParse({ doNotContact: false }).success).toBe(false);
    expect(crmDoNotContactSchema.safeParse({ doNotContact: false, reason: "Duplicate suppression was incorrect" }).success).toBe(true);
  });
});

import { createHash } from "node:crypto";
import type { CrmIdentityKey } from "./types";

export function normalizeCrmName(value: string): string {
  return value.trim().toLowerCase().normalize("NFKC").replace(/\s+/g, " ");
}

export function normalizeCrmEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeInstagramHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

/** Hash identity inputs so email addresses/handles never appear in document IDs. */
export function crmIdentityKeyId(
  organizationId: string,
  workspaceId: string,
  identityType: CrmIdentityKey["identityType"],
  normalizedValue: string,
): string {
  return createHash("sha256")
    .update([organizationId, workspaceId, identityType, normalizedValue].join("\u0000"))
    .digest("hex");
}


export interface CrmIdentityReference {
  id: string;
  identityType: CrmIdentityKey["identityType"];
}

/**
 * Computes the identity-key lifecycle for a contact update. Keys no longer
 * present in the desired identity set must be deleted; newly introduced keys
 * must be created. Retained keys are left untouched.
 */
export function diffCrmIdentityKeys(
  previous: readonly CrmIdentityReference[],
  next: readonly CrmIdentityReference[],
): { toCreate: CrmIdentityReference[]; toDelete: CrmIdentityReference[] } {
  const previousById = new Map(previous.map((item) => [item.id, item] as const));
  const nextById = new Map(next.map((item) => [item.id, item] as const));
  return {
    toCreate: [...nextById.values()].filter((item) => !previousById.has(item.id)),
    toDelete: [...previousById.values()].filter((item) => !nextById.has(item.id)),
  };
}

import "server-only";
import { isAdmin, canAccessCrmRecord, type Actor } from "@/domain/authz";
import { crmIdentityKeyId, diffCrmIdentityKeys, normalizeCrmEmail, normalizeCrmName, normalizeInstagramHandle } from "@/domain/crm";
import type { CrmAccount, CrmContact, CrmIdentityKey } from "@/domain/types";
import { writeAudit } from "../audit";
import { col, fromDoc, now } from "../db";
import { adminDb } from "../firebase-admin";
import { serverEnv } from "../env";
import { ApiError, conflict, forbidden, notFound } from "../http";
import { getScope } from "../scope";
import { assertActorInOrganization, assertActorProfile } from "./actor-access";

const org = () => serverEnv().ORGANIZATION_ID;
const SCHEMA_VERSION = 1;
const cleanOptional = (value: string | null | undefined) => value?.trim() || undefined;

async function assertWorkspace(actor: Actor, workspaceId: string) {
  await assertActorInOrganization(actor, org());
  const snap = await col("workspaces").doc(workspaceId).get();
  if (!snap.exists || snap.data()?.organizationId !== org() || snap.data()?.status !== "active") {
    throw notFound("Workspace not found or inactive.");
  }
  if (!isAdmin(actor)) {
    const scope = await getScope(actor.uid);
    if (!scope.workspaceIds.has(workspaceId)) throw forbidden("This workspace is outside your assigned scope.");
    return scope.workspaceIds;
  }
  return new Set<string>([workspaceId]);
}

async function assertActiveUser(userId: string, workspaceId?: string) {
  const snap = await col("users").doc(userId).get();
  if (!snap.exists || snap.data()?.organizationId !== org() || snap.data()?.status !== "active") {
    throw new ApiError(422, "invalid_crm_owner", "Choose an active Inhub user as the CRM record owner.");
  }
  if (workspaceId && snap.data()?.role !== "admin") {
    const scope = await getScope(userId);
    if (!scope.workspaceIds.has(workspaceId)) {
      throw new ApiError(422, "crm_owner_outside_workspace", "The selected owner must have an active membership in this workspace.");
    }
  }
}

async function assertCrmAccess(actor: Actor, record: CrmAccount | CrmContact) {
  // Validate the persisted actor and the record's workspace before applying
  // owner-based visibility. This also prevents Admin access to orphaned or
  // cross-organisation workspace records.
  const workspaceIds = await assertWorkspace(actor, record.workspaceId);
  if (!canAccessCrmRecord(actor, workspaceIds, record)) throw notFound("CRM record not found.");
}

async function assertAccountLink(actor: Actor, workspaceId: string, accountId?: string | null) {
  if (!accountId) return;
  const snap = await col("crmAccounts").doc(accountId).get();
  if (!snap.exists) throw new ApiError(422, "invalid_crm_account", "Choose an account in this workspace.");
  const account = fromDoc<CrmAccount>(snap);
  if (account.organizationId !== org() || account.workspaceId !== workspaceId || account.status !== "active") {
    throw new ApiError(422, "invalid_crm_account", "Choose an active account in this workspace.");
  }
  await assertCrmAccess(actor, account);
}

function identityKeysForContact(input: { email?: string | null; instagramHandle?: string | null }, organizationId: string, workspaceId: string) {
  const rows: { id: string; identityType: CrmIdentityKey["identityType"] }[] = [];
  const email = cleanOptional(input.email);
  const handle = cleanOptional(input.instagramHandle);
  const normalizedHandle = handle ? normalizeInstagramHandle(handle) : undefined;
  if (handle && (!normalizedHandle || !/^[a-z0-9._]{1,30}$/.test(normalizedHandle))) throw new ApiError(422, "invalid_instagram_handle", "Use 1–30 letters, numbers, periods or underscores for an Instagram handle.");
  if (email) rows.push({ id: crmIdentityKeyId(organizationId, workspaceId, "email", normalizeCrmEmail(email)), identityType: "email" });
  if (normalizedHandle) rows.push({ id: crmIdentityKeyId(organizationId, workspaceId, "instagram_handle", normalizedHandle), identityType: "instagram_handle" });
  return rows;
}

function throwDuplicateIdentity(existing: Record<string, unknown> | undefined) {
  throw new ApiError(409, "crm_duplicate_identity", "This email address or social profile is already linked to another CRM contact.", {
    existingRecordId: String(existing?.entityId ?? ""),
  });
}

export async function listCrmAccounts(actor: Actor, workspaceId: string): Promise<CrmAccount[]> {
  const workspaceIds = await assertWorkspace(actor, workspaceId);
  let query = col("crmAccounts").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).where("status", "==", "active");
  if (!isAdmin(actor)) query = query.where("ownerUserId", "==", actor.uid);
  const snap = await query.orderBy("normalizedName", "asc").limit(100).get();
  return snap.docs.map((doc) => fromDoc<CrmAccount>(doc)).filter((record) => canAccessCrmRecord(actor, workspaceIds, record));
}

export async function getCrmAccount(actor: Actor, id: string): Promise<CrmAccount> {
  const snap = await col("crmAccounts").doc(id).get();
  if (!snap.exists) throw notFound("CRM account not found.");
  const record = fromDoc<CrmAccount>(snap);
  if (record.organizationId !== org() || record.status !== "active") throw notFound("CRM account not found.");
  await assertCrmAccess(actor, record);
  return record;
}

export async function createCrmAccount(actor: Actor, input: {
  workspaceId: string; name: string; accountType: CrmAccount["accountType"]; industry?: string; website?: string;
  city?: string; region?: string; country?: string; ownerUserId?: string; source?: string; tags: string[]; notes?: string;
}, requestId: string): Promise<string> {
  if (actor.role === "member") throw forbidden("CRM record creation is currently limited to Leads and Admins.");
  await assertWorkspace(actor, input.workspaceId);
  const ownerUserId = isAdmin(actor) ? (input.ownerUserId ?? actor.uid) : actor.uid;
  if (input.ownerUserId && !isAdmin(actor)) throw forbidden("Only an Admin can assign a CRM record to another user.");
  await assertActiveUser(ownerUserId, input.workspaceId);
  const ref = col("crmAccounts").doc();
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, name: input.name.trim(), normalizedName: normalizeCrmName(input.name),
    accountType: input.accountType, industry: cleanOptional(input.industry), website: cleanOptional(input.website),
    city: cleanOptional(input.city), region: cleanOptional(input.region), country: cleanOptional(input.country),
    ownerUserId, source: cleanOptional(input.source), tags: [...new Set(input.tags)], status: "active" as const,
    notes: cleanOptional(input.notes), createdBy: actor.uid, updatedBy: actor.uid, createdAt: now(), updatedAt: now(), schemaVersion: SCHEMA_VERSION,
  };
  await adminDb().runTransaction(async (tx) => {
    const actorSnap = await tx.get(col("users").doc(actor.uid));
    assertActorProfile(actor, org(), actorSnap.exists ? actorSnap.data() : undefined);
    tx.create(ref, data);
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.account_created", resourceType: "crmAccount", resourceId: ref.id, workspaceId: input.workspaceId, subjectUserIds: [ownerUserId], after: { name: data.name, accountType: data.accountType, ownerUserId }, requestId });
  });
  return ref.id;
}

export async function updateCrmAccount(actor: Actor, id: string, input: {
  name?: string; accountType?: CrmAccount["accountType"]; industry?: string | null; website?: string | null; city?: string | null; region?: string | null;
  country?: string | null; ownerUserId?: string; source?: string | null; tags?: string[]; notes?: string | null;
}, requestId: string) {
  const ref = col("crmAccounts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("CRM account not found.");
  const before = fromDoc<CrmAccount>(snap);
  if (before.organizationId !== org() || before.status !== "active") throw notFound("CRM account not found.");
  await assertCrmAccess(actor, before);
  if (actor.role === "member" && Object.keys(input).some((key) => !["tags", "notes"].includes(key))) {
    throw forbidden("Team Members can update notes and tags on CRM accounts they own only.");
  }
  if (input.ownerUserId && !isAdmin(actor)) throw forbidden("Only an Admin can reassign CRM records.");
  if (input.ownerUserId) await assertActiveUser(input.ownerUserId, before.workspaceId);
  const accessWorkspaceIds = isAdmin(actor) ? new Set<string>() : (await getScope(actor.uid)).workspaceIds;
  const afterOwner = input.ownerUserId ?? before.ownerUserId;
  const patch: Record<string, unknown> = { updatedBy: actor.uid, updatedAt: now() };
  for (const key of ["accountType", "industry", "website", "city", "region", "country", "source", "tags", "notes"] as const) {
    if (key in input) patch[key] = key === "tags" ? [...new Set(input.tags ?? [])] : cleanOptional(input[key] as string | null | undefined) ?? null;
  }
  if (input.name !== undefined) { patch.name = input.name.trim(); patch.normalizedName = normalizeCrmName(input.name); }
  if (input.ownerUserId) patch.ownerUserId = input.ownerUserId;
  await adminDb().runTransaction(async (tx) => {
    const [current, actorSnap] = await Promise.all([tx.get(ref), tx.get(col("users").doc(actor.uid))]);
    assertActorProfile(actor, org(), actorSnap.exists ? actorSnap.data() : undefined);
    if (!current.exists || current.data()?.status !== "active" || current.data()?.organizationId !== org()) throw notFound("CRM account not found.");
    if (current.updateTime?.toMillis() !== snap.updateTime?.toMillis()) throw conflict("crm_record_changed", "This CRM account changed while you were editing it. Refresh and try again.");
    if (!canAccessCrmRecord(actor, accessWorkspaceIds, (current.data() as CrmAccount))) throw notFound("CRM account not found.");
    tx.update(ref, patch);
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.account_updated", resourceType: "crmAccount", resourceId: id, workspaceId: before.workspaceId, subjectUserIds: [before.ownerUserId, afterOwner], before: { name: before.name, ownerUserId: before.ownerUserId }, after: { name: patch.name ?? before.name, ownerUserId: afterOwner }, requestId });
  });
}

export async function archiveCrmAccount(actor: Actor, id: string, requestId: string) {
  await assertActorInOrganization(actor, org());
  if (!isAdmin(actor)) throw forbidden("Only an Admin can archive CRM accounts.");
  const ref = col("crmAccounts").doc(id);
  const existing = await ref.get();
  if (!existing.exists || existing.data()?.organizationId !== org()) throw notFound("CRM account not found.");
  await assertWorkspace(actor, String(existing.data()?.workspaceId ?? ""));
  await adminDb().runTransaction(async (tx) => {
    const [snap, actorSnap] = await Promise.all([tx.get(ref), tx.get(col("users").doc(actor.uid))]);
    assertActorProfile(actor, org(), actorSnap.exists ? actorSnap.data() : undefined);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("CRM account not found.");
    if (snap.data()?.status === "archived") return;
    tx.update(ref, { status: "archived", archivedAt: now(), updatedBy: actor.uid, updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.account_archived", resourceType: "crmAccount", resourceId: id, workspaceId: String(snap.data()?.workspaceId ?? ""), before: { status: "active" }, after: { status: "archived" }, requestId });
  });
}

export async function listCrmContacts(actor: Actor, workspaceId: string): Promise<CrmContact[]> {
  const workspaceIds = await assertWorkspace(actor, workspaceId);
  let query = col("crmContacts").where("organizationId", "==", org()).where("workspaceId", "==", workspaceId).where("status", "==", "active");
  if (!isAdmin(actor)) query = query.where("ownerUserId", "==", actor.uid);
  const snap = await query.orderBy("normalizedName", "asc").limit(100).get();
  return snap.docs.map((doc) => fromDoc<CrmContact>(doc)).filter((record) => canAccessCrmRecord(actor, workspaceIds, record));
}

export async function getCrmContact(actor: Actor, id: string): Promise<CrmContact> {
  const snap = await col("crmContacts").doc(id).get();
  if (!snap.exists) throw notFound("CRM contact not found.");
  const record = fromDoc<CrmContact>(snap);
  if (record.organizationId !== org() || record.status !== "active") throw notFound("CRM contact not found.");
  await assertCrmAccess(actor, record);
  return record;
}

export async function createCrmContact(actor: Actor, input: {
  workspaceId: string; recordType: CrmContact["recordType"]; displayName: string; accountId?: string; email?: string; phone?: string;
  instagramHandle?: string; instagramProfileUrl?: string; linkedinProfileUrl?: string; category?: string; ownerUserId?: string;
  source?: string; tags: string[]; notes?: string;
}, requestId: string): Promise<string> {
  if (actor.role === "member") throw forbidden("CRM record creation is currently limited to Leads and Admins.");
  await assertWorkspace(actor, input.workspaceId);
  const ownerUserId = isAdmin(actor) ? (input.ownerUserId ?? actor.uid) : actor.uid;
  if (input.ownerUserId && !isAdmin(actor)) throw forbidden("Only an Admin can assign a CRM record to another user.");
  await assertActiveUser(ownerUserId, input.workspaceId);
  await assertAccountLink(actor, input.workspaceId, input.accountId);
  const ref = col("crmContacts").doc();
  const identityRows = identityKeysForContact(input, org(), input.workspaceId);
  const identityRefs = identityRows.map((row) => col("crmIdentityKeys").doc(row.id));
  const email = cleanOptional(input.email);
  const handle = cleanOptional(input.instagramHandle);
  const data = {
    organizationId: org(), workspaceId: input.workspaceId, recordType: input.recordType, displayName: input.displayName.trim(),
    normalizedName: normalizeCrmName(input.displayName), accountId: input.accountId ?? null,
    email: email ?? null, emailNormalized: email ? normalizeCrmEmail(email) : null, phone: cleanOptional(input.phone) ?? null,
    instagramHandleNormalized: handle ? normalizeInstagramHandle(handle) : null,
    instagramProfileUrl: cleanOptional(input.instagramProfileUrl) ?? null, linkedinProfileUrl: cleanOptional(input.linkedinProfileUrl) ?? null,
    category: cleanOptional(input.category) ?? null, ownerUserId, source: cleanOptional(input.source) ?? null,
    tags: [...new Set(input.tags)], doNotContact: false, status: "active" as const, notes: cleanOptional(input.notes) ?? null,
    createdBy: actor.uid, updatedBy: actor.uid, createdAt: now(), updatedAt: now(), schemaVersion: SCHEMA_VERSION,
  };
  await adminDb().runTransaction(async (tx) => {
    const [actorSnap, ...keySnaps] = await Promise.all([
      tx.get(col("users").doc(actor.uid)),
      ...identityRefs.map((identityRef) => tx.get(identityRef)),
    ]);
    assertActorProfile(actor, org(), actorSnap.exists ? actorSnap.data() : undefined);
    const duplicate = keySnaps.find((keySnap) => keySnap.exists);
    if (duplicate) throwDuplicateIdentity(duplicate.data());
    tx.create(ref, data);
    identityRows.forEach((row, index) => {
      const identityRef = identityRefs[index]!;
      tx.create(identityRef, { organizationId: org(), workspaceId: input.workspaceId, identityType: row.identityType, entityType: "contact", entityId: ref.id, createdAt: now() });
    });
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.contact_created", resourceType: "crmContact", resourceId: ref.id, workspaceId: input.workspaceId, subjectUserIds: [ownerUserId], after: { recordType: data.recordType, displayName: data.displayName, ownerUserId, hasEmail: !!email, hasInstagram: !!handle }, requestId });
  });
  return ref.id;
}

export async function updateCrmContact(actor: Actor, id: string, input: {
  displayName?: string; accountId?: string | null; email?: string | null; phone?: string | null; instagramHandle?: string | null;
  instagramProfileUrl?: string | null; linkedinProfileUrl?: string | null; category?: string | null; ownerUserId?: string;
  source?: string | null; tags?: string[]; notes?: string | null;
}, requestId: string) {
  const ref = col("crmContacts").doc(id);
  const beforeSnap = await ref.get();
  if (!beforeSnap.exists) throw notFound("CRM contact not found.");
  const before = fromDoc<CrmContact>(beforeSnap);
  if (before.organizationId !== org() || before.status !== "active") throw notFound("CRM contact not found.");
  await assertCrmAccess(actor, before);
  if (actor.role === "member" && Object.keys(input).some((key) => !["notes", "tags"].includes(key))) {
    throw forbidden("Team Members can update notes and tags on CRM contacts they own only.");
  }
  if (input.ownerUserId && !isAdmin(actor)) throw forbidden("Only an Admin can reassign CRM records.");
  if (input.ownerUserId) await assertActiveUser(input.ownerUserId, before.workspaceId);
  if ("accountId" in input) await assertAccountLink(actor, before.workspaceId, input.accountId);

  const newEmail = "email" in input ? cleanOptional(input.email) : (before.emailNormalized ?? before.email);
  const newHandle = "instagramHandle" in input ? cleanOptional(input.instagramHandle) : before.instagramHandleNormalized;
  const previousIdentityRows = identityKeysForContact({
    email: before.emailNormalized ?? before.email,
    instagramHandle: before.instagramHandleNormalized,
  }, org(), before.workspaceId);
  const identityRows = identityKeysForContact({ email: newEmail, instagramHandle: newHandle }, org(), before.workspaceId);
  const identityChanges = diffCrmIdentityKeys(previousIdentityRows, identityRows);
  const allIdentityRows = [...new Map([...previousIdentityRows, ...identityRows].map((row) => [row.id, row] as const)).values()];
  const identityRefs = new Map(allIdentityRows.map((row) => [row.id, col("crmIdentityKeys").doc(row.id)] as const));
  const patch: Record<string, unknown> = { updatedBy: actor.uid, updatedAt: now() };
  if (input.displayName !== undefined) { patch.displayName = input.displayName.trim(); patch.normalizedName = normalizeCrmName(input.displayName); }
  if ("accountId" in input) patch.accountId = input.accountId ?? null;
  if ("email" in input) { patch.email = newEmail ?? null; patch.emailNormalized = newEmail ? normalizeCrmEmail(newEmail) : null; }
  if ("phone" in input) patch.phone = cleanOptional(input.phone) ?? null;
  if ("instagramHandle" in input) patch.instagramHandleNormalized = newHandle ? normalizeInstagramHandle(newHandle) : null;
  if ("instagramProfileUrl" in input) patch.instagramProfileUrl = cleanOptional(input.instagramProfileUrl) ?? null;
  if ("linkedinProfileUrl" in input) patch.linkedinProfileUrl = cleanOptional(input.linkedinProfileUrl) ?? null;
  if ("category" in input) patch.category = cleanOptional(input.category) ?? null;
  if ("source" in input) patch.source = cleanOptional(input.source) ?? null;
  if (input.tags) patch.tags = [...new Set(input.tags)];
  if ("notes" in input) patch.notes = cleanOptional(input.notes) ?? null;
  if (input.ownerUserId) patch.ownerUserId = input.ownerUserId;
  const accessWorkspaceIds = isAdmin(actor) ? new Set<string>() : (await getScope(actor.uid)).workspaceIds;

  await adminDb().runTransaction(async (tx) => {
    const identityEntries = [...identityRefs.entries()];
    const [currentSnap, actorSnap, ...identitySnaps] = await Promise.all([
      tx.get(ref),
      tx.get(col("users").doc(actor.uid)),
      ...identityEntries.map(([, identityRef]) => tx.get(identityRef)),
    ]);
    assertActorProfile(actor, org(), actorSnap.exists ? actorSnap.data() : undefined);
    if (!currentSnap.exists || currentSnap.data()?.organizationId !== org() || currentSnap.data()?.status !== "active") throw notFound("CRM contact not found.");
    if (currentSnap.updateTime?.toMillis() !== beforeSnap.updateTime?.toMillis()) throw conflict("crm_record_changed", "This CRM contact changed while you were editing it. Refresh and try again.");
    if (!canAccessCrmRecord(actor, accessWorkspaceIds, (currentSnap.data() as CrmContact))) throw notFound("CRM contact not found.");

    const identitySnapById = new Map(identityEntries.map(([identityId], index) => [identityId, identitySnaps[index]!] as const));
    const duplicate = identityRows
      .map((row) => identitySnapById.get(row.id))
      .find((keySnap) => keySnap?.exists && keySnap.data()?.entityId !== id);
    if (duplicate?.exists) throwDuplicateIdentity(duplicate.data());

    // Read-before-write transaction: the contact and its unique identity index
    // move together. Stale keys are deleted only when they still point to this
    // contact, never when an index document has been corrupted/reassigned.
    tx.update(ref, patch);
    identityChanges.toDelete.forEach((row) => {
      const keySnap = identitySnapById.get(row.id);
      if (keySnap?.exists && keySnap.data()?.entityId === id) tx.delete(identityRefs.get(row.id)!);
    });
    // Recreate a missing retained key as well as newly introduced keys. This
    // repairs incomplete indexes without ever overwriting another contact.
    identityRows.forEach((row) => {
      const keySnap = identitySnapById.get(row.id);
      if (keySnap?.exists) return;
      tx.create(identityRefs.get(row.id)!, {
        organizationId: org(), workspaceId: before.workspaceId, identityType: row.identityType,
        entityType: "contact", entityId: id, createdAt: now(),
      });
    });
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.contact_updated", resourceType: "crmContact", resourceId: id, workspaceId: before.workspaceId, subjectUserIds: [before.ownerUserId, input.ownerUserId ?? before.ownerUserId], before: { displayName: before.displayName, ownerUserId: before.ownerUserId, hasEmail: !!before.email, hasInstagram: !!before.instagramHandleNormalized }, after: { displayName: patch.displayName ?? before.displayName, ownerUserId: input.ownerUserId ?? before.ownerUserId, hasEmail: !!newEmail, hasInstagram: !!newHandle }, requestId });
  });
}

export async function setCrmContactDoNotContact(actor: Actor, id: string, doNotContact: boolean, reason: string | undefined, requestId: string) {
  const ref = col("crmContacts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("CRM contact not found.");
  const before = fromDoc<CrmContact>(snap);
  if (before.organizationId !== org() || before.status !== "active") throw notFound("CRM contact not found.");
  await assertCrmAccess(actor, before);
  if (!doNotContact && !isAdmin(actor)) throw forbidden("Only an Admin can clear do-not-contact status.");
  if (!doNotContact && !reason?.trim()) throw new ApiError(422, "reason_required", "A reason is required to clear do-not-contact status.");
  if (before.doNotContact === doNotContact) return;
  const accessWorkspaceIds = isAdmin(actor) ? new Set<string>() : (await getScope(actor.uid)).workspaceIds;
  await adminDb().runTransaction(async (tx) => {
    const [current, actorSnap] = await Promise.all([tx.get(ref), tx.get(col("users").doc(actor.uid))]);
    assertActorProfile(actor, org(), actorSnap.exists ? actorSnap.data() : undefined);
    if (!current.exists || current.data()?.organizationId !== org() || current.data()?.status !== "active") throw notFound("CRM contact not found.");
    if (current.updateTime?.toMillis() !== snap.updateTime?.toMillis()) throw conflict("crm_record_changed", "This CRM contact changed while you were editing it. Refresh and try again.");
    if (!canAccessCrmRecord(actor, accessWorkspaceIds, (current.data() as CrmContact))) throw notFound("CRM contact not found.");
    tx.update(ref, {
      doNotContact,
      doNotContactReason: doNotContact ? (cleanOptional(reason) ?? "operator_requested") : null,
      doNotContactSetBy: doNotContact ? actor.uid : null,
      doNotContactSetAt: doNotContact ? now() : null,
      updatedBy: actor.uid,
      updatedAt: now(),
    });
    writeAudit(tx, { actorUserId: actor.uid, action: doNotContact ? "crm.contact_do_not_contact_set" : "crm.contact_do_not_contact_cleared", resourceType: "crmContact", resourceId: id, workspaceId: before.workspaceId, subjectUserIds: [before.ownerUserId], before: { doNotContact: before.doNotContact }, after: { doNotContact, reason: reason ?? null }, requestId });
  });
}

export async function archiveCrmContact(actor: Actor, id: string, requestId: string) {
  await assertActorInOrganization(actor, org());
  if (!isAdmin(actor)) throw forbidden("Only an Admin can archive CRM contacts.");
  const ref = col("crmContacts").doc(id);
  const existing = await ref.get();
  if (!existing.exists || existing.data()?.organizationId !== org()) throw notFound("CRM contact not found.");
  await assertWorkspace(actor, String(existing.data()?.workspaceId ?? ""));
  await adminDb().runTransaction(async (tx) => {
    const [snap, actorSnap] = await Promise.all([tx.get(ref), tx.get(col("users").doc(actor.uid))]);
    assertActorProfile(actor, org(), actorSnap.exists ? actorSnap.data() : undefined);
    if (!snap.exists || snap.data()?.organizationId !== org()) throw notFound("CRM contact not found.");
    if (snap.data()?.status === "archived") return;
    tx.update(ref, { status: "archived", archivedAt: now(), updatedBy: actor.uid, updatedAt: now() });
    writeAudit(tx, { actorUserId: actor.uid, action: "crm.contact_archived", resourceType: "crmContact", resourceId: id, workspaceId: String(snap.data()?.workspaceId ?? ""), subjectUserIds: [String(snap.data()?.ownerUserId ?? "")], before: { status: "active" }, after: { status: "archived" }, requestId });
  });
}

import { readFile, writeFile } from "node:fs/promises";

const indexesPath = new URL("../firestore.indexes.json", import.meta.url);
const vercelPath = new URL("../vercel.json", import.meta.url);

const asc = (fieldPath) => ({ fieldPath, order: "ASCENDING" });
const desc = (fieldPath) => ({ fieldPath, order: "DESCENDING" });
const requiredIndexes = [
  // Keep the owner-scoped CRM queries used by Lead and Team Member views in sync
  // with the indexes already created manually in the production Firebase project.
  { collectionGroup: "crmAccounts", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("ownerUserId"), asc("status"), asc("workspaceId"), asc("normalizedName")] },
  { collectionGroup: "crmContacts", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("ownerUserId"), asc("status"), asc("workspaceId"), asc("normalizedName")] },
  { collectionGroup: "tasks", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("dueAt")] },
  { collectionGroup: "automationRules", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("enabled")] },
  { collectionGroup: "automationRuns", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("status"), asc("nextRetryAt")] },
  { collectionGroup: "automationRuns", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("status"), asc("leaseUntil")] },
  { collectionGroup: "automationRuns", queryScope: "COLLECTION", fields: [asc("organizationId"), desc("createdAt")] },
  { collectionGroup: "notificationDigestItems", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("status"), asc("createdAt")] },
  { collectionGroup: "notificationDigests", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("status"), asc("nextRetryAt")] },
  { collectionGroup: "notificationDigests", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("status"), asc("leaseUntil")] },
  { collectionGroup: "notificationDigests", queryScope: "COLLECTION", fields: [asc("organizationId"), desc("createdAt")] },
  { collectionGroup: "emailDeliveries", queryScope: "COLLECTION", fields: [asc("organizationId"), desc("createdAt")] },
  { collectionGroup: "domainEvents", queryScope: "COLLECTION", fields: [asc("organizationId"), asc("status"), desc("createdAt")] },
];

const indexKey = (index) => JSON.stringify({
  collectionGroup: index.collectionGroup,
  queryScope: index.queryScope,
  fields: index.fields,
});

const indexes = JSON.parse(await readFile(indexesPath, "utf8"));
if (!Array.isArray(indexes.indexes) || !Array.isArray(indexes.fieldOverrides)) {
  throw new Error("firestore.indexes.json has an unexpected shape; no files were changed.");
}
const existing = new Set(indexes.indexes.map(indexKey));
let added = 0;
for (const index of requiredIndexes) {
  const key = indexKey(index);
  if (!existing.has(key)) {
    indexes.indexes.push(index);
    existing.add(key);
    added++;
  }
}

const vercel = JSON.parse(await readFile(vercelPath, "utf8"));
if (!Array.isArray(vercel.crons)) throw new Error("vercel.json has no crons array; no files were changed.");
const cronPath = "/api/cron/process-outbox";
const cron = vercel.crons.find((item) => item.path === cronPath);
if (cron) {
  cron.schedule = "35 3 * * *";
} else {
  vercel.crons.push({ path: cronPath, schedule: "35 3 * * *" });
}

await writeFile(indexesPath, `${JSON.stringify(indexes, null, 2)}\n`);
await writeFile(vercelPath, `${JSON.stringify(vercel, null, 2)}\n`);
console.log(`Module 5 config applied. Added ${added} Firestore composite index(es).`);
console.log("Cron /api/cron/process-outbox set to 03:35 UTC daily (09:05 India Standard Time). Existing unrelated indexes and cron jobs were preserved.");
console.log("The index merge includes the two owner-scoped CRM indexes previously required by Lead/Team Member queries.");

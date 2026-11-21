import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const targetPath = resolve(root, "firestore.indexes.json");
const additionsPath = resolve(root, "docs/crm-workflows-index-additions.json");

function signature(index) {
  return JSON.stringify({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: index.fields.map((field) => ({
      fieldPath: field.fieldPath,
      order: field.order ?? null,
      arrayConfig: field.arrayConfig ?? null,
    })),
  });
}

const [currentText, additionsText] = await Promise.all([
  readFile(targetPath, "utf8"),
  readFile(additionsPath, "utf8"),
]);
const current = JSON.parse(currentText);
const additions = JSON.parse(additionsText);

if (!Array.isArray(current.indexes) || !Array.isArray(additions.indexes)) {
  throw new Error("Invalid Firestore index configuration: expected indexes arrays.");
}

const existing = new Set(current.indexes.map(signature));
const missing = additions.indexes.filter((index) => !existing.has(signature(index)));

if (missing.length === 0) {
  console.log(`No index changes needed. ${current.indexes.length} composite indexes already present.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupPath = `${targetPath}.backup-${stamp}`;
await copyFile(targetPath, backupPath);
current.indexes.push(...missing);
const tempPath = `${targetPath}.tmp`;
await writeFile(tempPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
await rename(tempPath, targetPath);

console.log(`Added ${missing.length} CRM workflow indexes to firestore.indexes.json.`);
console.log(`Composite indexes now: ${current.indexes.length}.`);
console.log(`Backup: ${backupPath}`);
console.log("No Firebase deployment was performed.");

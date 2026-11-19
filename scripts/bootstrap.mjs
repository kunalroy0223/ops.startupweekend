#!/usr/bin/env node
/**
 * Admin-only bootstrap (database-schema.md §4.4: the first Admin is never
 * created through a public invitation path).
 *
 *   npm run bootstrap -- --email you@inspiria.edu.in --name "Your Name"
 *
 * Creates (idempotently) the organisation, the default workspace and the
 * first Admin, then prints a one-time password-setup link. Refuses to add
 * another Admin when one already exists unless --allow-additional-admin.
 * Reads .env.local. Works against the emulators when USE_FIREBASE_EMULATORS=true.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
    "org-name": { type: "string", default: "Inhub E-Cell" },
    "workspace-name": { type: "string", default: "Inhub Workspace" },
    timezone: { type: "string", default: "Asia/Kolkata" },
    "allow-additional-admin": { type: "boolean", default: false },
  },
});

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
if (!email || !name) {
  console.error('Usage: npm run bootstrap -- --email you@example.com --name "Your Name" [--password ...]');
  process.exit(1);
}

const env = process.env;
const orgId = env.ORGANIZATION_ID || "inhub";
const emulators = env.USE_FIREBASE_EMULATORS === "true";
if (emulators) {
  env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
  initializeApp({ projectId: env.FIREBASE_PROJECT_ID || "demo-inhub" });
} else {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    console.error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.");
    process.exit(1);
  }
  initializeApp({ credential: cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) });
}
const db = getFirestore();
const auth = getAuth();
const now = Timestamp.now();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const admins = await db.collection("users").where("organizationId", "==", orgId).where("role", "==", "admin").where("status", "==", "active").get();
if (!admins.empty && !values["allow-additional-admin"]) {
  console.error(`An active Admin already exists (${admins.docs.map((d) => d.data().email).join(", ")}). Promote people from the app, or pass --allow-additional-admin.`);
  process.exit(2);
}

let user;
try {
  user = await auth.getUserByEmail(email);
  console.log(`• Auth user exists: ${user.uid}`);
} catch (e) {
  if (e.code !== "auth/user-not-found") throw e;
  user = await auth.createUser({ email, displayName: name, emailVerified: true, ...(values.password ? { password: values.password } : {}) });
  console.log(`• Created auth user: ${user.uid}`);
}

const orgRef = db.collection("organizations").doc(orgId);
await db.runTransaction(async (tx) => {
  const org = await tx.get(orgRef);
  const workspaces = await tx.get(db.collection("workspaces").where("organizationId", "==", orgId).limit(1));
  const profile = await tx.get(db.collection("users").doc(user.uid));
  if (!org.exists) tx.set(orgRef, { name: values["org-name"], slug: slug(values["org-name"]), status: "active", timezone: values.timezone, createdAt: now, updatedAt: now, schemaVersion: 1 });
  let workspaceId = workspaces.docs[0]?.id;
  if (!workspaceId) {
    const ref = db.collection("workspaces").doc();
    workspaceId = ref.id;
    tx.set(ref, { organizationId: orgId, name: values["workspace-name"], slug: slug(values["workspace-name"]), description: "The organisation-wide workspace.", status: "active", createdBy: user.uid, createdAt: now, updatedAt: now, schemaVersion: 1 });
  }
  if (profile.exists) {
    tx.update(profile.ref, { role: "admin", status: "active", updatedAt: now });
  } else {
    tx.set(profile.ref, { organizationId: orgId, email, emailNormalized: email, displayName: name, searchName: name.toLowerCase(), role: "admin", status: "active", createdAt: now, updatedAt: now, schemaVersion: 1 });
    tx.set(db.collection("notificationPreferences").doc(user.uid), { organizationId: orgId, userId: user.uid, inAppEnabled: true, emailEnabled: true, deliveryMode: "immediate", disabledEventTypes: [], updatedAt: now });
  }
  tx.set(db.collection("auditLogs").doc(), { organizationId: orgId, actorUserId: user.uid, action: "system.bootstrap", resourceType: "organization", resourceId: orgId, subjectUserIds: [user.uid], workspaceId, after: { adminEmail: email }, createdAt: FieldValue.serverTimestamp() });
});
await auth.updateUser(user.uid, { disabled: false });
console.log(`• Organisation "${orgId}", default workspace and Admin profile are ready.`);

if (!values.password) {
  const link = await auth.generatePasswordResetLink(email);
  const code = new URL(link).searchParams.get("oobCode");
  const appUrl = env.APP_URL || "http://localhost:3000";
  console.log(`\nSet the Admin password (one-time link, expires in 1 hour):\n  ${appUrl}/reset-password?oobCode=${encodeURIComponent(code)}\n`);
}

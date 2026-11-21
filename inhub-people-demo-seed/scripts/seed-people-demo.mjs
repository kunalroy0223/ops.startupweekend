#!/usr/bin/env node
/**
 * Create reversible People-directory and pending-invitation fixtures in the
 * local Firebase emulators only. Existing Admin and workspace are reused.
 *
 *   node scripts/seed-people-demo.mjs
 *   node scripts/seed-people-demo.mjs --clean
 */
import { existsSync } from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const env = process.env;
if (env.USE_FIREBASE_EMULATORS !== "true") {
  throw new Error("Refusing to run: USE_FIREBASE_EMULATORS must be exactly true in .env.local.");
}
if (!env.FIREBASE_PROJECT_ID?.startsWith("demo-")) {
  throw new Error("Refusing to run: FIREBASE_PROJECT_ID must be a demo-* project.");
}

// Keep all Admin SDK traffic on the local emulator endpoints.
env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
if (!getApps().length) initializeApp({ projectId: env.FIREBASE_PROJECT_ID });

const db = getFirestore();
const orgId = env.ORGANIZATION_ID || "inhub";
const marker = "demoSeed";
const clean = process.argv.includes("--clean");
const nowMs = Date.now();
const now = Timestamp.fromMillis(nowMs);
const ts = (ms) => Timestamp.fromMillis(ms);

async function findExistingAdminAndWorkspace() {
  const [usersSnap, workspacesSnap] = await Promise.all([
    db.collection("users").where("organizationId", "==", orgId).get(),
    db.collection("workspaces").where("organizationId", "==", orgId).get(),
  ]);
  const adminDoc = usersSnap.docs.find((doc) => {
    const data = doc.data();
    return data.role === "admin" && data.status === "active";
  });
  const workspaceDoc = workspacesSnap.docs.find((doc) => doc.data().status === "active");
  if (!adminDoc) throw new Error(`No active Admin profile found in organisation "${orgId}". No records were written.`);
  if (!workspaceDoc) throw new Error(`No active workspace found in organisation "${orgId}". No records were written.`);
  return { adminDoc, workspaceDoc };
}

async function removeFixtures() {
  let removed = 0;
  for (const collectionName of ["users", "invitations"]) {
    const snap = await db.collection(collectionName).where(marker, "==", true).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.size;
  }
  console.log(`Removed ${removed} demo fixture document(s) from the local emulator.`);
}

function makeSealedToken(token) {
  const keyB64 = env.DATA_ENCRYPTION_KEY;
  if (!keyB64 || Buffer.from(keyB64, "base64").length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be set to a valid base64-encoded 32-byte key in .env.local.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

async function upsertDemoDoc(collectionName, id, data) {
  const ref = db.collection(collectionName).doc(id);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.[marker] !== true) {
    throw new Error(`Refusing to overwrite existing non-demo document: ${collectionName}/${id}`);
  }
  await ref.set(data, { merge: true });
}

if (clean) {
  await removeFixtures();
} else {
  const { adminDoc, workspaceDoc } = await findExistingAdminAndWorkspace();
  const adminUid = adminDoc.id;
  const workspaceId = workspaceDoc.id;

  const people = [
    { uid: "demo_person_01", name: "Aditi Sharma", email: "aditi.sharma@inhub.test", role: "lead", status: "active", title: "Innovation & Programs Lead", daysAgo: 35 },
    { uid: "demo_person_02", name: "Rohan Das", email: "rohan.das@inhub.test", role: "lead", status: "active", title: "Product Design Lead", daysAgo: 30 },
    { uid: "demo_person_03", name: "Meera Pradhan", email: "meera.pradhan@inhub.test", role: "member", status: "active", title: "Operations Coordinator", daysAgo: 24 },
    { uid: "demo_person_04", name: "Arjun Tamang", email: "arjun.tamang@inhub.test", role: "member", status: "active", title: "Partnerships Associate", daysAgo: 20 },
    { uid: "demo_person_05", name: "Saanvi Rai", email: "saanvi.rai@inhub.test", role: "member", status: "active", title: "Marketing & Communications", daysAgo: 16 },
    { uid: "demo_person_06", name: "Tenzing Lepcha", email: "tenzing.lepcha@inhub.test", role: "member", status: "active", title: "Technology Volunteer", daysAgo: 12 },
    { uid: "demo_person_07", name: "Ananya Subba", email: "ananya.subba@inhub.test", role: "member", status: "suspended", title: "Community Associate", daysAgo: 9 },
    { uid: "demo_person_08", name: "Rishav Gurung", email: "rishav.gurung.partnerships.north.bengal@inhub.test", role: "member", status: "active", title: "Partnerships & Outreach", daysAgo: 5 },
  ];

  for (const person of people) {
    const emailNormalized = person.email.toLowerCase();
    const createdAt = ts(nowMs - person.daysAgo * 86_400_000);
    await upsertDemoDoc("users", person.uid, {
      organizationId: orgId,
      email: person.email,
      emailNormalized,
      displayName: person.name,
      searchName: person.name.trim().toLowerCase().replace(/\s+/g, " "),
      title: person.title,
      role: person.role,
      status: person.status,
      createdAt,
      updatedAt: now,
      ...(person.status === "active" ? { lastLoginAt: ts(nowMs - Math.max(1, person.daysAgo - 2) * 86_400_000) } : {}),
      schemaVersion: 1,
      [marker]: true,
    });
  }

  const keyB64 = env.DATA_ENCRYPTION_KEY;
  if (!keyB64 || Buffer.from(keyB64, "base64").length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be set to a valid base64-encoded 32-byte key in .env.local.");
  }
  const invites = [
    { id: "demo_invitation_01", email: "design.candidate@inhub.test", role: "lead", daysAgo: 1 },
    { id: "demo_invitation_02", email: "operations.candidate@inhub.test", role: "member", daysAgo: 2 },
    { id: "demo_invitation_03", email: "partnerships.coordinator.north.bengal@inhub.test", role: "member", daysAgo: 3 },
  ];

  for (const invite of invites) {
    const emailNormalized = invite.email.toLowerCase();
    const token = randomBytes(32).toString("base64url");
    const createdAt = ts(nowMs - invite.daysAgo * 86_400_000);
    await upsertDemoDoc("invitations", invite.id, {
      organizationId: orgId,
      email: invite.email,
      emailNormalized,
      intendedRole: invite.role,
      workspaceIds: [workspaceId],
      initialWorkstreamIds: [],
      initialTeamIds: [],
      status: "pending",
      tokenHash: createHash("sha256").update(token, "utf8").digest("hex"),
      tokenCiphertext: makeSealedToken(token),
      tokenVersion: 1,
      expiresAt: ts(nowMs + 7 * 86_400_000),
      invitedBy: adminUid,
      createdAt,
      updatedAt: now,
      schemaVersion: 1,
      [marker]: true,
    });
  }

  console.log(`Seeded ${people.length} demo directory profiles and ${invites.length} pending invitations.`);
  console.log(`Organisation: ${orgId}`);
  console.log(`Reused Admin: ${adminDoc.data().email ?? adminUid}`);
  console.log(`Reused workspace: ${workspaceDoc.data().name} (${workspaceId})`);
  console.log("No Auth accounts were created and no invitation emails were sent.");
  console.log("To remove only these fixtures later, run: node scripts/seed-people-demo.mjs --clean");
}

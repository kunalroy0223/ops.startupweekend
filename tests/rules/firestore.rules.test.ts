/**
 * Firestore Security Rules tests. Run with `npm run test:rules` (starts the
 * Firestore emulator). Covers the mandatory RBAC security cases that apply to
 * direct database access.
 */
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, deleteDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-inhub", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 } });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const user = (role: string, status = "active") => ({ organizationId: "inhub", role, status, email: "x@y.in", displayName: "X" });
    await setDoc(doc(db, "users/admin"), user("admin"));
    await setDoc(doc(db, "users/lead"), user("lead"));
    await setDoc(doc(db, "users/mem"), user("member"));
    await setDoc(doc(db, "users/gone"), user("member", "deactivated"));
    await setDoc(doc(db, "teams/t1"), { name: "T1", workspaceId: "w", status: "active" });
    await setDoc(doc(db, "teams/t2"), { name: "T2", workspaceId: "w", status: "active" });
    await setDoc(doc(db, "workstreams/ws1"), { name: "WS1", workspaceId: "w", status: "active" });
    await setDoc(doc(db, "workstreams/ws2"), { name: "WS2", workspaceId: "w", status: "active" });
    await setDoc(doc(db, "teamMemberships/t1_mem"), { teamId: "t1", userId: "mem", status: "active", membershipType: "member" });
    await setDoc(doc(db, "teamMemberships/t2_mem"), { teamId: "t2", userId: "mem", status: "inactive", membershipType: "member" });
    await setDoc(doc(db, "teamMemberships/t1_gone"), { teamId: "t1", userId: "gone", status: "active", membershipType: "member" });
    await setDoc(doc(db, "workstreamMemberships/ws1_lead"), { workstreamId: "ws1", userId: "lead", status: "active", membershipType: "lead" });
    await setDoc(doc(db, "notifications/n1"), { recipientUserId: "mem", title: "Hi" });
    await setDoc(doc(db, "auditLogs/a1"), { actorUserId: "mem", action: "x" });
    await setDoc(doc(db, "emailDeliveries/d1"), { status: "pending" });
    await setDoc(doc(db, "invitations/i1"), { tokenHash: "h", status: "pending" });
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe("Firestore Security Rules", () => {
  it("unauthenticated users cannot read protected resources", async () => {
    await assertFails(getDoc(doc(as(null), "teams/t1")));
    await assertFails(getDoc(doc(as(null), "users/mem")));
    await assertFails(getDoc(doc(as(null), "organizations/inhub")));
  });
  it("a deactivated user cannot read team data", async () => {
    await assertFails(getDoc(doc(as("gone"), "teams/t1")));
  });
  it("a Team Member cannot change their own role or status", async () => {
    await assertFails(updateDoc(doc(as("mem"), "users/mem"), { role: "admin" }));
    await assertFails(updateDoc(doc(as("mem"), "users/mem"), { status: "active" }));
  });
  it("a Team Member reads their team but not another team by direct ID", async () => {
    await assertSucceeds(getDoc(doc(as("mem"), "teams/t1")));
    await assertFails(getDoc(doc(as("mem"), "teams/t2")));
  });
  it("a user removed from a team (inactive membership) loses access", async () => {
    await assertFails(getDoc(doc(as("mem"), "teams/t2")));
  });
  it("a Lead cannot read a workstream outside their assignment", async () => {
    await assertSucceeds(getDoc(doc(as("lead"), "workstreams/ws1")));
    await assertFails(getDoc(doc(as("lead"), "workstreams/ws2")));
  });
  it("Admin can read every team and workstream", async () => {
    await assertSucceeds(getDoc(doc(as("admin"), "teams/t2")));
    await assertSucceeds(getDoc(doc(as("admin"), "workstreams/ws2")));
    await assertSucceeds(getDoc(doc(as("admin"), "users/lead")));
  });
  it("users read only their own notifications", async () => {
    await assertSucceeds(getDoc(doc(as("mem"), "notifications/n1")));
    await assertFails(getDoc(doc(as("lead"), "notifications/n1")));
  });
  it("clients cannot create, modify or delete audit logs", async () => {
    await assertFails(addDoc(collection(as("admin"), "auditLogs"), { action: "forged" }));
    await assertFails(updateDoc(doc(as("admin"), "auditLogs/a1"), { action: "edited" }));
    await assertFails(deleteDoc(doc(as("admin"), "auditLogs/a1")));
    await assertFails(getDoc(doc(as("mem"), "auditLogs/a1")));
  });
  it("clients cannot mark email deliveries as sent", async () => {
    await assertFails(updateDoc(doc(as("admin"), "emailDeliveries/d1"), { status: "sent" }));
    await assertFails(getDoc(doc(as("admin"), "emailDeliveries/d1")));
  });
  it("invitation token hashes are never readable by clients", async () => {
    await assertFails(getDoc(doc(as("admin"), "invitations/i1")));
  });
  it("no client writes anywhere, even for Admin", async () => {
    await assertFails(setDoc(doc(as("admin"), "teams/t3"), { name: "x" }));
    await assertFails(setDoc(doc(as("admin"), "teamMemberships/t2_lead"), { teamId: "t2", userId: "lead", status: "active" }));
    await assertFails(setDoc(doc(as("mem"), "notificationPreferences/mem"), { emailEnabled: false }));
  });
});

#!/usr/bin/env node
/**
 * End-to-end smoke test against a running app wired to the Firebase emulators.
 *   1. npm run emulators            (terminal 1)
 *   2. npm run build && npm start   (terminal 2, with .env.local in emulator mode)
 *   3. npm run bootstrap -- --email admin@inspiria.edu.in --name "Asha Admin" --password "Admin-pass-123"
 *   4. npm run test:e2e
 * Exercises: sign-in, structure admin, invitation + acceptance, RBAC on pages
 * and APIs, role change, deactivation, notifications and the outbox.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// Resolved with require so a globally installed Playwright also works.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "e2e-screenshots";
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@inspiria.edu.in", password: process.env.ADMIN_PASSWORD ?? "Admin-pass-123" };
mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString(36);
let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
// Let entrance animations settle so screenshots show the resting state.
const shot = async (page, name) => {
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const api = (page, path, method = "GET", body) =>
  page.evaluate(async ([p, m, b]) => {
    const r = await fetch(p, { method: m, headers: b ? { "Content-Type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [path, method, body]);

// ── Admin ──
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const admin = await adminCtx.newPage();
await admin.goto(`${BASE}/people`);
check(admin.url().includes("/login"), "unauthenticated visit redirects to sign-in");
await shot(admin, "01-login");
await signIn(admin, ADMIN.email, "wrong-password-1");
await admin.locator("#main").getByText("don't match an account").waitFor();
await admin.locator("[aria-live] [role=alert]").getByText("don't match an account").waitFor();
check(true, "wrong password shows a clear inline error and an error pop-up");
await shot(admin, "01b-error-popup");
await signIn(admin, ADMIN.email, ADMIN.password);
await admin.waitForURL("**/overview");
check(true, "Admin signs in and lands on overview");
await admin.getByRole("heading", { level: 1 }).waitFor();
await admin.waitForTimeout(400);
await shot(admin, "02-admin-overview-empty");

const ws = await api(admin, "/api/structure/workstreams", "POST", { workspaceId: "does-not-exist", name: "Bad workstream" });
check(ws.status === 422, "a workstream in a missing workspace is rejected by the API");

await admin.goto(`${BASE}/structure?new=workstream`);
await admin.getByRole("dialog").getByLabel("Name").fill(`Partnerships ${stamp}`);
await admin.getByRole("dialog").getByLabel("Description").fill("Sponsors, partners and community relationships.");
await admin.getByRole("dialog").getByRole("button", { name: "Create workstream" }).click();
await admin.waitForURL("**/structure/workstreams/**");
const wsId = admin.url().split("/").pop();
check(!!wsId, "Admin creates a workstream through the UI");

await admin.goto(`${BASE}/structure?new=team`);
await admin.getByRole("dialog").getByLabel("Name").fill(`Outreach ${stamp}`);
await admin.getByRole("dialog").getByText(`Partnerships ${stamp}`).click();
await admin.getByRole("dialog").getByRole("button", { name: "Create team" }).click();
await admin.waitForURL("**/structure/teams/**");
const teamId = admin.url().split("/").pop();
check(!!teamId, "Admin creates a team linked to the workstream");

await admin.goto(`${BASE}/people?invite=1`);
const memberEmail = `member.${stamp}@inspiria.edu.in`;
await admin.getByRole("dialog").getByLabel("Email").fill(memberEmail);
await admin.getByRole("dialog").getByText(`Outreach ${stamp}`).click();
await admin.getByRole("dialog").getByRole("button", { name: "Send invitation" }).click();
const linkInput = admin.getByRole("dialog").getByLabel("Invitation link");
await linkInput.waitFor();
const inviteUrl = await linkInput.inputValue();
check(/\/invite\/[A-Za-z0-9_-]{40,}$/.test(inviteUrl), "invitation creates a single-use link");
await shot(admin, "03-invite-created");
await admin.getByRole("dialog").getByRole("button", { name: "Done" }).click();
const dup = await api(admin, "/api/invitations", "POST", { email: memberEmail, intendedRole: "member", workspaceId: "anything" });
check(dup.status === 422 || dup.status === 409, "duplicate/invalid invitation rejected");

// ── Invitee ──
const memberCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const member = await memberCtx.newPage();
await member.goto(inviteUrl);
await member.getByText(memberEmail).waitFor();
await shot(member, "04-accept-invitation");
await member.getByLabel("Your name").fill("Rohan Member");
await member.getByLabel("Password", { exact: true }).fill("Member-pass-123");
await member.getByLabel("Confirm password").fill("Member-pass-123");
await member.getByRole("button", { name: "Create account" }).click();
await member.waitForURL("**/overview", { timeout: 20000 });
check(true, "invitee sets up the account and is signed in");
await member.waitForTimeout(1500);
await member.reload();
await member.getByRole("heading", { level: 1 }).waitFor();
await shot(member, "05-member-overview");
check(await member.getByText(`Outreach ${stamp}`).first().isVisible(), "member sees their team on the overview");

const reused = await member.request.post(`${BASE}/api/invitations/accept`, { headers: { Origin: BASE }, data: { token: inviteUrl.split("/").pop(), displayName: "Again", password: "Member-pass-123" } });
check(reused.status() === 409, "invitation link cannot be reused");

// RBAC on APIs and pages
const forbiddenInvite = await api(member, "/api/invitations", "POST", { email: "x@y.in", intendedRole: "member", workspaceId: "w" });
check(forbiddenInvite.status === 403, "Team Member cannot invite (API 403)");
const meUid = (await api(member, "/api/me")).json.data.uid;
const selfPromote = await api(member, `/api/users/${meUid}/role`, "POST", { role: "admin" });
check(selfPromote.status === 403, "Team Member cannot change their own role (API 403)");
const selfField = await api(member, "/api/me", "PATCH", { role: "admin" });
check(selfField.status === 422, "role cannot be smuggled into a profile update");
const ws2 = await api(member, "/api/structure/workstreams", "POST", { workspaceId: "w", name: "Hack" });
check(ws2.status === 403 || ws2.status === 422, "Team Member cannot create workstreams");
const crossOrigin = await member.request.patch(`${BASE}/api/me`, { headers: { Origin: "https://evil.example" }, data: { displayName: "x" } });
check(crossOrigin.status() === 403, "cross-origin mutation is rejected (CSRF)");

// Admin creates a second team the member is NOT in
await admin.goto(`${BASE}/structure?new=team`);
await admin.getByRole("dialog").getByLabel("Name").fill(`Finance ${stamp}`);
await admin.getByRole("dialog").getByRole("button", { name: "Create team" }).click();
await admin.waitForURL("**/structure/teams/**");
const privateTeam = admin.url().split("/").pop();
const direct = await member.goto(`${BASE}/structure/teams/${privateTeam}`);
await member.getByText("Nothing at this").waitFor();
// Streaming (loading.tsx) can send 200 before notFound() resolves; what matters is that nothing leaks.
check([200, 404].includes(direct.status()) && !(await member.getByText(`Finance ${stamp}`).count()), "member gets the not-found page, with no data, for another team's URL");
const settings = await member.goto(`${BASE}/settings`);
check(settings.status() === 200 && !(await member.getByText("Email delivery").count()), "member settings hide admin sections");
const people = await member.goto(`${BASE}/people`);
check(people.status() === 200 && !(await member.getByRole("button", { name: "Invite person" }).count()), "member cannot see the invite action");

// Admin: change role to Lead, then add as Lead of the team
await admin.goto(`${BASE}/people/${meUid}`);
await admin.getByRole("heading", { level: 1 }).waitFor();
await shot(admin, "06-person-detail");
await admin.getByRole("button", { name: "Change role" }).click();
await admin.getByRole("dialog").getByLabel("New role").selectOption("lead");
await admin.getByRole("dialog").getByRole("button", { name: "Make Lead" }).click();
await admin.getByText("Rohan Member is now Lead.").waitFor();
check(true, "Admin promotes the member to Lead");
const leadAdd = await api(admin, `/api/users/${meUid}/memberships`, "POST", { scopeKind: "workstream", scopeId: wsId, membershipType: "lead" });
check(leadAdd.status === 201, "Admin assigns the Lead to the workstream");
await member.goto(`${BASE}/structure/workstreams/${wsId}`);
await member.getByRole("heading", { level: 1 }).waitFor();
check((await member.title()).length > 0 && (await member.getByText(`Partnerships ${stamp}`).first().isVisible()), "Lead can open their workstream");
const leadInvite = await api(member, "/api/invitations", "POST", { email: "x@y.in", intendedRole: "member", workspaceId: "w" });
check(leadInvite.status === 403, "Lead cannot invite users in v1");

// Outbox + notifications
await admin.goto(`${BASE}/settings`);
await admin.getByRole("button", { name: "Process queue now" }).click();
await admin.waitForTimeout(1500);
await admin.reload();
await shot(admin, "07-admin-settings");
await member.goto(`${BASE}/notifications`);
await member.waitForTimeout(500);
await shot(member, "08-member-notifications");
check(await member.getByText("Your role is now Lead").first().isVisible(), "role change produced an in-app notification");
const before = await member.locator("li").count();
await api(admin, "/api/ops/process-outbox", "POST");
await member.reload();
check((await member.locator("li").count()) === before, "re-processing the outbox creates no duplicates");
check(await admin.getByText("provider_not_configured").first().isVisible(), "emails are recorded as failed while Resend is unconfigured");

// Deactivate: member is locked out
await admin.goto(`${BASE}/people/${meUid}`);
await admin.getByRole("button", { name: "Deactivate" }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
await admin.getByText(/deactivated?\./i).first().waitFor();
const afterDeact = await member.goto(`${BASE}/overview`);
await member.waitForURL("**/login**");
check(member.url().includes("/login"), "deactivated user is signed out on the next request");
void afterDeact;
await signIn(member, memberEmail, "Member-pass-123");
await member.getByText(/disabled|not active|Contact/).first().waitFor();
check(true, "deactivated user cannot sign in again");

await admin.goto(`${BASE}/activity`);
await admin.getByRole("heading", { level: 1, name: "Activity" }).waitFor();
await shot(admin, "09-activity");
check(await admin.getByText("changed an account status").first().isVisible(), "deactivation is in the audit log");
await admin.goto(`${BASE}/overview`);
await admin.getByRole("heading", { level: 1 }).waitFor();
await admin.waitForTimeout(400);
await shot(admin, "10-admin-overview");
await admin.goto(`${BASE}/structure`);
await admin.getByRole("heading", { level: 1 }).waitFor();
await admin.waitForTimeout(400);
await shot(admin, "11-structure");
await admin.goto(`${BASE}/structure/teams/${teamId}`);
await admin.getByRole("heading", { level: 1 }).waitFor();
await admin.waitForTimeout(400);
await shot(admin, "12-team");

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await adminCtx.storageState() });
const m = await mobile.newPage();
await m.goto(`${BASE}/people`);
await m.getByRole("heading", { level: 1 }).waitFor();
await m.waitForTimeout(400);
await shot(m, "13-mobile-people");
await m.getByRole("button", { name: "Open navigation" }).click();
await shot(m, "14-mobile-nav");

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

import { NextResponse } from "next/server";
import { sessionCreateSchema } from "@/domain/validation";
import { writeAudit } from "@/server/audit";
import { col, now } from "@/server/db";
import { serverEnv } from "@/server/env";
import { adminAuth, adminDb } from "@/server/firebase-admin";
import { ApiError, assertSameOrigin, parseBody, route } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session";

const RECENT_SIGN_IN_SECONDS = 5 * 60;

/** Exchanges a fresh Firebase ID token for an httpOnly session cookie, after checking account status. */
export const POST = route(async (req, { requestId }) => {
  assertSameOrigin(req);
  const { idToken } = await parseBody(req, sessionCreateSchema);
  const env = serverEnv();
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    throw new ApiError(401, "invalid_token", "Your sign-in could not be verified. Try again.");
  }
  if (Date.now() / 1000 - decoded.auth_time > RECENT_SIGN_IN_SECONDS) throw new ApiError(401, "stale_sign_in", "Please sign in again.");

  const ref = col("users").doc(decoded.uid);
  const profile = await ref.get();
  if (!profile.exists || profile.data()?.organizationId !== env.ORGANIZATION_ID) {
    throw new ApiError(403, "no_profile", "This account is not set up for Inhub Workspace. Ask an Admin for an invitation.");
  }
  const status = profile.data()?.status;
  if (status !== "active") throw new ApiError(403, "account_" + status, status === "suspended" ? "This account is suspended. Contact an Admin." : "This account is not active. Contact an Admin.");

  const expiresIn = env.SESSION_MAX_AGE_DAYS * 86_400_000;
  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
  const batch = adminDb().batch();
  batch.update(ref, { lastLoginAt: now() });
  writeAudit(batch, { actorUserId: decoded.uid, action: "auth.signed_in", resourceType: "user", resourceId: decoded.uid, subjectUserIds: [decoded.uid], requestId });
  await batch.commit();

  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: new URL(env.APP_URL).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn / 1000,
  });
  return res;
});

export const DELETE = route(async (req) => {
  assertSameOrigin(req);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});

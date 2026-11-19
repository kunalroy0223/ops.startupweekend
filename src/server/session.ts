import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "@/domain/authz";
import type { UserProfile, UserStatus } from "@/domain/types";
import { adminAuth } from "./firebase-admin";
import { col, fromDoc } from "./db";
import { serverEnv } from "./env";

export const SESSION_COOKIE = "__session";

export type SessionState =
  | { state: "anonymous" }
  | { state: "inactive"; status: UserStatus | "missing_profile" | "wrong_organisation" }
  | { state: "active"; actor: Actor; profile: UserProfile };

/**
 * Authoritative session check. Verifies the httpOnly session cookie with
 * revocation checking, then loads role and status from Firestore on every
 * request. Custom claims are never trusted for authorisation.
 */
export async function resolveSession(cookieValue: string | undefined): Promise<SessionState> {
  if (!cookieValue) return { state: "anonymous" };
  let uid: string;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookieValue, true);
    uid = decoded.uid;
  } catch {
    return { state: "anonymous" };
  }
  const snap = await col("users").doc(uid).get();
  if (!snap.exists) return { state: "inactive", status: "missing_profile" };
  const profile = fromDoc<UserProfile>(snap, "uid");
  if (profile.organizationId !== serverEnv().ORGANIZATION_ID) return { state: "inactive", status: "wrong_organisation" };
  if (profile.status !== "active") return { state: "inactive", status: profile.status };
  const actor: Actor = {
    uid,
    organizationId: profile.organizationId,
    role: profile.role,
    status: profile.status,
    email: profile.email,
    displayName: profile.displayName,
  };
  return { state: "active", actor, profile };
}

/** Per-request memoised session for server components. */
export const getSession = cache(async (): Promise<SessionState> => {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
});

/** For pages and layouts: redirects anyone without an active account. */
export async function requireActive(): Promise<{ actor: Actor; profile: UserProfile }> {
  const session = await getSession();
  if (session.state === "anonymous") redirect("/login");
  if (session.state === "inactive") redirect(`/api/auth/signout?reason=${encodeURIComponent(session.status)}`);
  return { actor: session.actor, profile: session.profile };
}

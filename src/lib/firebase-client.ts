"use client";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence, type Auth } from "firebase/auth";
import { publicEnv } from "./public-env";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

/**
 * Client Auth is used only to prove the password and mint an ID token. The
 * token is exchanged for an httpOnly server session cookie and the client is
 * signed out again, so no long-lived credential lives in browser storage.
 */
export async function clientAuth(): Promise<Auth> {
  if (auth) return auth;
  app = getApps()[0] ?? initializeApp({ apiKey: publicEnv.apiKey, authDomain: publicEnv.authDomain, projectId: publicEnv.projectId, appId: publicEnv.appId });
  auth = getAuth(app);
  if (publicEnv.useEmulators) connectAuthEmulator(auth, publicEnv.authEmulatorUrl, { disableWarnings: true });
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}

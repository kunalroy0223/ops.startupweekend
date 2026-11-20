import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { serverEnv } from "./env";

/**
 * Firebase Admin SDK. Admin access BYPASSES Firestore Security Rules, so every
 * caller must authorise explicitly through src/domain/authz.ts first.
 */
let app: App | undefined;
let db: Firestore | undefined;

function adminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) return (app = existing);
  const env = serverEnv();
  if (env.USE_FIREBASE_EMULATORS) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8085";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    app = initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  } else {
    app = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL!,
        // Vercel stores multi-line keys with literal "\n".
        privateKey: env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    });
  }
  return app;
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminDb(): Firestore {
  if (!db) {
    db = getFirestore(adminApp());
    // Route handlers and pages can load this module separately but share one
    // Firestore instance, and settings() may only be applied once per instance.
    const flag = globalThis as { __inhubFirestoreConfigured?: boolean };
    if (!flag.__inhubFirestoreConfigured) {
      db.settings({ ignoreUndefinedProperties: true });
      flag.__inhubFirestoreConfigured = true;
    }
  }
  return db;
}

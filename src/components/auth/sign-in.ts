"use client";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { api } from "@/lib/api";
import { clientAuth } from "@/lib/firebase-client";

/** Password sign-in → ID token → httpOnly server session. The client auth state is discarded afterwards. */
export async function signInAndCreateSession(email: string, password: string): Promise<void> {
  const auth = await clientAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  try {
    const idToken = await cred.user.getIdToken(true);
    await api("/api/auth/session", { body: { idToken } });
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}

/**
 * Browser-safe Firebase web config. These values are public by design
 * (Firebase identifies the project with them; security comes from Auth and
 * Security Rules). Never add a secret here.
 */
export const publicEnv = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  useEmulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true",
  authEmulatorUrl: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099",
};

export function publicEnvProblems(): string[] {
  const missing: string[] = [];
  if (!publicEnv.apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!publicEnv.authDomain) missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!publicEnv.projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  return missing;
}

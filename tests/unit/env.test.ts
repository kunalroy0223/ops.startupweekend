import { describe, expect, it } from "vitest";
import { ConfigurationError, parseServerEnv } from "@/server/env";

const base = { APP_URL: "https://x.vercel.app", FIREBASE_PROJECT_ID: "p", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), CRON_SECRET: "x".repeat(32) };

describe("environment validation", () => {
  it("requires Admin credentials outside the emulator", () => {
    expect(() => parseServerEnv(base)).toThrow(ConfigurationError);
    expect(parseServerEnv({ ...base, USE_FIREBASE_EMULATORS: "true" }).USE_FIREBASE_EMULATORS).toBe(true);
  });
  it("applies the documented defaults", () => {
    const env = parseServerEnv({ ...base, USE_FIREBASE_EMULATORS: "true" });
    expect(env.EMAIL_FROM).toBe("Startup Weekend Workspace <no-reply@startupweekend.sbs>");
    expect(env.SESSION_MAX_AGE_DAYS).toBe(5);
    expect(env.RESEND_API_KEY).toBeUndefined();
  });
  it("rejects a short CRON_SECRET and a bad encryption key", () => {
    expect(() => parseServerEnv({ ...base, USE_FIREBASE_EMULATORS: "true", CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
    expect(() => parseServerEnv({ ...base, USE_FIREBASE_EMULATORS: "true", DATA_ENCRYPTION_KEY: "abc" })).toThrow(/DATA_ENCRYPTION_KEY/);
  });
  it("rejects a malformed Resend key", () => {
    expect(() => parseServerEnv({ ...base, USE_FIREBASE_EMULATORS: "true", RESEND_API_KEY: "sk_live" })).toThrow(/RESEND_API_KEY/);
  });
});

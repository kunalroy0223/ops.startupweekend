import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ serverEnv: () => ({ DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64") }) }));

const { generateToken, hashToken, seal, unseal } = await import("@/server/tokens");
const { verifyWebhookSignature } = await import("@/server/email/resend");

describe("invitation tokens", () => {
  it("are 256-bit, URL-safe and unique", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });
  it("are stored only as a SHA-256 hash", () => {
    const t = generateToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });
  it("seal/unseal round-trips and rejects tampering or the wrong key", () => {
    const key = randomBytes(32).toString("base64");
    const sealed = seal("secret-token", key);
    expect(sealed).not.toContain("secret-token");
    expect(unseal(sealed, key)).toBe("secret-token");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => unseal(parts.join("."), key)).toThrow();
    expect(() => unseal(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
});

describe("Resend webhook signature", () => {
  const secretBytes = randomBytes(24);
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const sign = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const now = 1_800_000_000;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });

  it("accepts a valid signature", () => {
    expect(verifyWebhookSignature({ id: "msg_1", timestamp: String(now), signature: sign("msg_1", String(now), body), body }, secret, now)).toBe(true);
  });
  it("accepts when one of several signatures matches", () => {
    expect(verifyWebhookSignature({ id: "msg_1", timestamp: String(now), signature: `v1,AAAA ${sign("msg_1", String(now), body)}`, body }, secret, now)).toBe(true);
  });
  it("rejects a modified body, wrong secret, missing headers and stale timestamps", () => {
    const sig = sign("msg_1", String(now), body);
    expect(verifyWebhookSignature({ id: "msg_1", timestamp: String(now), signature: sig, body: body + " " }, secret, now)).toBe(false);
    expect(verifyWebhookSignature({ id: "msg_1", timestamp: String(now), signature: sig, body }, `whsec_${randomBytes(24).toString("base64")}`, now)).toBe(false);
    expect(verifyWebhookSignature({ id: null, timestamp: String(now), signature: sig, body }, secret, now)).toBe(false);
    expect(verifyWebhookSignature({ id: "msg_1", timestamp: String(now), signature: sig, body }, secret, now + 301)).toBe(false);
  });
});

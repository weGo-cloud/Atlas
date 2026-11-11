import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { resolveVerificationChallenge, verifyWhatsAppSignature } from "../signature";

const SECRET = "test-app-secret";

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyWhatsAppSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyWhatsAppSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, missing header, or malformed header", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyWhatsAppSignature(body + "x", sign(body), SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, sign(body, "wrong-secret"), SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, null, SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, "not-a-real-signature", SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha1=deadbeef", SECRET)).toBe(false);
  });

  it("rejects when no app secret is configured, even with a well-formed header", () => {
    const body = "{}";
    expect(verifyWhatsAppSignature(body, sign(body), "")).toBe(false);
  });
});

describe("resolveVerificationChallenge", () => {
  const VERIFY_TOKEN = "my-verify-token";

  it("echoes the challenge when mode and token are correct", () => {
    const params = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345" });
    expect(resolveVerificationChallenge(params, VERIFY_TOKEN)).toBe("12345");
  });

  it("refuses a wrong token, wrong mode, or missing server-side token", () => {
    const good = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345" });
    expect(resolveVerificationChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "1" }), VERIFY_TOKEN)).toBeNull();
    expect(resolveVerificationChallenge(new URLSearchParams({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1" }), VERIFY_TOKEN)).toBeNull();
    expect(resolveVerificationChallenge(good, undefined)).toBeNull();
  });
});

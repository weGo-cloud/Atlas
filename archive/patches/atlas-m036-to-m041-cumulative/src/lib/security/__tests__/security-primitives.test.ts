import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generatePublicApiKey, hashPublicApiKey, publicApiKeyHint } from "../api-key";
import { checkRateLimit, resetRateLimit, resetRateLimitsForTests } from "../rate-limit";
import { SecretConfigError, decryptSecret, encryptSecret, isEncryptedSecret, isEncryptionConfigured } from "../secret-box";

describe("public API key helpers", () => {
  it("generates a distinct 192-bit key in the wego_live_ format", () => {
    const a = generatePublicApiKey();
    const b = generatePublicApiKey();
    expect(a).toMatch(/^wego_live_[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically to sha256 hex and never contains the key", () => {
    const key = generatePublicApiKey();
    const hash = hashPublicApiKey(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashPublicApiKey(key));
    expect(hash).not.toContain(key.slice(10, 30));
    expect(hashPublicApiKey(key + "x")).not.toBe(hash);
  });

  it("hint shows only 4+4 characters of the key body", () => {
    const key = "wego_live_" + "abcd" + "0".repeat(40) + "wxyz";
    expect(publicApiKeyHint(key)).toBe("wego_live_abcd…wxyz");
    expect(publicApiKeyHint(key)).not.toContain("0000");
  });
});

describe("secret box (AES-256-GCM)", () => {
  const original = process.env.ATLAS_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.ATLAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ATLAS_ENCRYPTION_KEY;
    else process.env.ATLAS_ENCRYPTION_KEY = original;
  });

  it("round-trips and never stores the plaintext", () => {
    const stored = encryptSecret("EAAG-super-secret-token");
    expect(isEncryptedSecret(stored)).toBe(true);
    expect(stored).not.toContain("super-secret");
    expect(decryptSecret(stored)).toBe("EAAG-super-secret-token");
  });

  it("uses a fresh IV each time (same input, different ciphertext)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("detects tampering", () => {
    const parts = encryptSecret("token").split(":");
    const data = Buffer.from(parts[4], "base64");
    data[0] ^= 0xff;
    parts[4] = data.toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("fails with the wrong key", () => {
    const stored = encryptSecret("token");
    process.env.ATLAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(stored)).toThrow();
  });

  it("refuses to encrypt without a key or with a malformed key (no silent plaintext)", () => {
    delete process.env.ATLAS_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(SecretConfigError);
    process.env.ATLAS_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("x")).toThrow(SecretConfigError);
  });

  it("refuses to 'decrypt' a non-envelope value", () => {
    expect(() => decryptSecret("plain-token")).toThrow();
  });
});

describe("shared rate limiter", () => {
  beforeEach(() => resetRateLimitsForTests());

  it("allows up to the limit then blocks with a retry hint, per key", () => {
    for (let i = 0; i < 3; i++) expect(checkRateLimit("k", 3, 60_000, 1000).allowed).toBe(true);
    const blocked = checkRateLimit("k", 3, 60_000, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkRateLimit("other", 3, 60_000, 1000).allowed).toBe(true);
  });

  it("window expiry and resetRateLimit both clear a block", () => {
    for (let i = 0; i < 4; i++) checkRateLimit("k", 3, 60_000, 1000);
    expect(checkRateLimit("k", 3, 60_000, 1000 + 60_001).allowed).toBe(true);
    for (let i = 0; i < 4; i++) checkRateLimit("j", 3, 60_000, 1000);
    resetRateLimit("j");
    expect(checkRateLimit("j", 3, 60_000, 1000).allowed).toBe(true);
  });
});

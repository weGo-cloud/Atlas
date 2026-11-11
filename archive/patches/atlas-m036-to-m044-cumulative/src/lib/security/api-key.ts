import { createHash, randomBytes } from "node:crypto";

export const PUBLIC_API_KEY_PREFIX = "wego_live_";

/** 192 bits of randomness; the plaintext is shown to the owner exactly once. */
export function generatePublicApiKey(): string {
  return `${PUBLIC_API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

/**
 * SHA-256 (hex). Unsalted is correct here: the input is a 192-bit random
 * token, not a human password, so there is nothing to brute-force or
 * rainbow-table — the hash exists so a leaked database/backup can't be
 * replayed as live credentials.
 */
export function hashPublicApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Safe-to-display identifier, e.g. `wego_live_ab12…9f3e`. */
export function publicApiKeyHint(key: string): string {
  const body = key.startsWith(PUBLIC_API_KEY_PREFIX) ? key.slice(PUBLIC_API_KEY_PREFIX.length) : key;
  return `${PUBLIC_API_KEY_PREFIX}${body.slice(0, 4)}…${body.slice(-4)}`;
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Mission 037 — encrypts third-party credentials (e.g. per-business
 * Meta/WhatsApp access tokens) at rest with AES-256-GCM.
 *
 * Envelope: `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>`. The version tag
 * allows key/algorithm rotation later without a flag day. The key comes
 * only from ATLAS_ENCRYPTION_KEY (base64, 32 bytes: `openssl rand -base64 32`).
 * There is deliberately NO fallback key: without one, storing a secret
 * fails loudly rather than silently writing plaintext.
 */
const PREFIX = "enc:v1:";

export class SecretConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretConfigError";
  }
}

function loadKey(): Buffer {
  const raw = process.env.ATLAS_ENCRYPTION_KEY;
  if (!raw) throw new SecretConfigError("ATLAS_ENCRYPTION_KEY is not set; refusing to store a credential unencrypted.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new SecretConfigError("ATLAS_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Throws on tampering or a wrong key (GCM authentication failure). Caller must pass an encrypted value. */
export function decryptSecret(stored: string): string {
  if (!isEncryptedSecret(stored)) throw new Error("Value is not an encrypted secret.");
  const key = loadKey();
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

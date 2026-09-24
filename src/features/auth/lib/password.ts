import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// 64 bytes is the standard scrypt output length for password hashing
// (matches Node's own documented recommendation for this exact use).
const KEY_LENGTH = 64;

/**
 * Hashes a password with scrypt — a memory-hard KDF built into Node,
 * so there's no bcrypt/argon2 native-binding dependency to install
 * (the same class of risk that made Prisma's engine binaries
 * unreachable in this sandbox back in Mission 006). Output format is
 * `salt:hash`, both hex-encoded, with a fresh random salt per call.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a password against a `salt:hash` string produced by
 * hashPassword. Uses a constant-time comparison so response timing
 * can't be used to guess the hash byte-by-byte.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(hashHex, "hex");

  // timingSafeEqual throws on length mismatch rather than returning
  // false, so guard that first — a mismatched length is definitely a
  // non-match, not an error case.
  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}

import { DatabaseUserRepository } from "@/features/auth/repository/database-user-repository";
import { verifyPassword } from "@/features/auth/lib/password";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";

/**
 * Mission 040 — step-up authentication. Changing where customer money is collected (the M-Pesa account) is the one action
 * that would let a hijacked session quietly redirect payments to an attacker, so it re-asks for the owner's password even
 * though they're signed in. Guessing attempts are limited per user and the failure message never says why.
 */
export async function confirmPassword(user: { id: string; email: string }, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0 || password.length > 200) return false;
  const key = `stepup:${user.id}`;
  if (!checkRateLimit(key, 5, 15 * 60_000).allowed) return false;
  const credentials = await new DatabaseUserRepository().getCredentialsByEmail(user.email);
  if (!credentials || credentials.user.id !== user.id) return false;
  const ok = await verifyPassword(password, credentials.passwordHash);
  if (ok) resetRateLimit(key);
  return ok;
}

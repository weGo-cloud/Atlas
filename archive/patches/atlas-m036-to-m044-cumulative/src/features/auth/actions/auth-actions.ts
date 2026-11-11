"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { clientKeyFromHeaders } from "@/features/assistant/channels/web-channel";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { authService } from "../service";
import type { AuthServiceError } from "../domain/errors";
import { clearSessionCookie, setSessionCookie } from "../lib/session-cookie";
import { readSessionCookie } from "../lib/session-cookie";

export type SignInActionResult = { ok: true } | { ok: false; error: AuthServiceError };

// Mission 037 — brute-force protection. Per-account (so one attacker can't hammer one user from
// many IPs) and per-IP (so one attacker can't spray many accounts). Both windows are checked
// BEFORE the password is verified, so a locked-out caller learns nothing about correctness.
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_PER_EMAIL = 5;
const LOGIN_MAX_PER_IP = 20;

export async function signInAction(
  email: string,
  password: string
): Promise<SignInActionResult> {
  const ip = clientKeyFromHeaders(await headers());
  const emailKey = `login-email:${email.trim().toLowerCase()}`;
  const ipLimit = checkRateLimit(`login-ip:${ip}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
  const emailLimit = checkRateLimit(emailKey, LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW_MS);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const seconds = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds);
    return {
      ok: false,
      error: { code: "RATE_LIMITED", message: `Too many sign-in attempts. Try again in ${Math.max(1, Math.ceil(seconds / 60))} minute(s).` },
    };
  }

  const result = await authService.signIn(email, password);
  if (!result.ok) return { ok: false, error: result.error };

  resetRateLimit(emailKey); // a successful sign-in clears that account's failure window
  await setSessionCookie(result.data.token);
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  const token = await readSessionCookie();
  if (token) {
    await authService.signOut(token);
  }
  await clearSessionCookie();
  redirect("/login");
}

"use server";

import { redirect } from "next/navigation";

import { authService } from "../service";
import type { AuthServiceError } from "../domain/errors";
import { clearSessionCookie, setSessionCookie } from "../lib/session-cookie";
import { readSessionCookie } from "../lib/session-cookie";

export type SignInActionResult = { ok: true } | { ok: false; error: AuthServiceError };

export async function signInAction(
  email: string,
  password: string
): Promise<SignInActionResult> {
  const result = await authService.signIn(email, password);
  if (!result.ok) return { ok: false, error: result.error };

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

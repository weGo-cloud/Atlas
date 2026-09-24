import { redirect } from "next/navigation";

import type { Business } from "../domain/business";
import type { User } from "../domain/user";
import { authService } from "../service";
import { readSessionCookie } from "./session-cookie";

export type CurrentSession = { user: User; business: Business };

/**
 * Resolves the current request's session, or null if there isn't a
 * valid one. Never throws/redirects — use this where "not logged in"
 * is a normal, handled state (e.g. the login page itself checking
 * whether to bounce an already-signed-in visitor).
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  return authService.getSessionUser(token);
}

/**
 * Resolves the current session or redirects to /login. This is the
 * one function every protected page and every mutating server action
 * calls — the single boundary "avoid repeatedly decoding
 * authentication information manually throughout the application"
 * (Mission 012, Phase 10) is built around. Redirecting works
 * correctly from both Server Components and Server Actions (Next.js
 * handles the NEXT_REDIRECT signal in either context), so this same
 * call is safe to use at the top of a page render or at the top of an
 * action body.
 */
export async function requireCurrentSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

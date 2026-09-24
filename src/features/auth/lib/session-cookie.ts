import { cookies } from "next/headers";

import { SESSION_DURATION_MS } from "../domain/session";

export const SESSION_COOKIE_NAME = "atlas_session";

/**
 * Sets the session cookie. Only callable from a Server Action or
 * Route Handler (Next.js only allows writing cookies in those
 * contexts) — never from a plain Server Component render.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function readSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

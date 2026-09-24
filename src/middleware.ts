import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "atlas_session";
const PROTECTED_PREFIX = "/app";

/**
 * Middleware runs on the Edge runtime, which can't reach better-sqlite3
 * (a native Node binding) — so this can only check whether a session
 * cookie is *present*, not whether it's actually valid or expired.
 * That's an intentional, correct split: this gives unauthenticated
 * users a fast redirect without a DB round-trip, while
 * requireCurrentSession() in src/app/app/layout.tsx does the
 * authoritative, DB-backed validation (real token lookup + expiry
 * check) on the Node runtime before any business data ever renders.
 * A forged or stale cookie passes this check but is rejected there.
 */
export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith(PROTECTED_PREFIX)) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};

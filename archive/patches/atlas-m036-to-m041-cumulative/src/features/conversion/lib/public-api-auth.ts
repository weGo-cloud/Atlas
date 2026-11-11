import { NextResponse } from "next/server";

import { clientKeyFromHeaders } from "@/features/assistant/channels/web-channel";
import type { Business } from "@/features/auth/domain/business";
import { DatabaseBusinessRepository } from "@/features/auth/repository/database-business-repository";
import { hashPublicApiKey } from "@/lib/security/api-key";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Mission 037 — the one authentication/abuse gate for /api/public/v1/*.
 *
 * Order matters: per-IP limit first (cheap, blocks key-guessing floods),
 * then key lookup, then a per-key limit, then the business's browser-origin
 * allowlist. Server-to-server callers send no Origin header and are governed
 * by the key alone; a browser request from an origin the business hasn't
 * allowed is rejected server-side (CORS headers alone only hide the response,
 * they don't stop a write).
 */
type Limits = { perIpPerMinute: number; perKeyPerMinute: number };

export type PublicApiAuth =
  | { ok: true; business: Business; cors: Record<string, string> }
  | { ok: false; response: NextResponse };

const BASE_CORS = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function preflightResponse(methods: string): NextResponse {
  // A preflight carries no Authorization header, so it can't be tied to a business here;
  // the origin allowlist is enforced on the real request that follows.
  return new NextResponse(null, {
    status: 204,
    headers: { ...BASE_CORS, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": methods },
  });
}

export async function authenticatePublicApi(request: Request, methods: string, limits: Limits, scope: string): Promise<PublicApiAuth> {
  const openCors = { ...BASE_CORS, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": methods };
  const fail = (error: string, status: number, extra: Record<string, string> = {}) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status, headers: { ...openCors, ...extra } }),
  });

  const ip = clientKeyFromHeaders(request.headers);
  const ipLimit = checkRateLimit(`pubapi-ip:${scope}:${ip}`, limits.perIpPerMinute, 60_000);
  if (!ipLimit.allowed) return fail("Too many requests.", 429, { "Retry-After": String(ipLimit.retryAfterSeconds) });

  const apiKey = bearerToken(request);
  if (!apiKey) return fail("Missing API key.", 401);

  const business = await new DatabaseBusinessRepository().getByPublicApiKey(apiKey);
  if (!business) return fail("Invalid API key.", 401);

  const keyLimit = checkRateLimit(`pubapi-key:${scope}:${hashPublicApiKey(apiKey)}`, limits.perKeyPerMinute, 60_000);
  if (!keyLimit.allowed) return fail("Too many requests.", 429, { "Retry-After": String(keyLimit.retryAfterSeconds) });

  const origin = request.headers.get("origin");
  const allowed = business.publicApiAllowedOrigins;
  if (allowed.length > 0 && origin && !allowed.includes(origin)) {
    return fail("This origin is not allowed to use this API key.", 403);
  }

  // With an allowlist, only ever reflect an allowed origin; without one, keep the open behaviour.
  const cors =
    allowed.length > 0 && origin
      ? { ...BASE_CORS, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": methods, Vary: "Origin" }
      : openCors;
  return { ok: true, business, cors };
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

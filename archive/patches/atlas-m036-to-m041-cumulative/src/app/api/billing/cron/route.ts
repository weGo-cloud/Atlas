import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { clientKeyFromHeaders } from "@/features/assistant/channels/web-channel";
import { BillingService } from "@/features/billing/service/billing-service";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Mission 041 — the billing scheduler entry point. Call it hourly from any scheduler (system cron `curl`, a hosted cron):
 *   curl -fsS -X POST -H "Authorization: Bearer $BILLING_CRON_SECRET" https://<domain>/api/billing/cron
 * Protected by a long shared secret (constant-time compare). With no/short secret configured the endpoint is disabled (404),
 * so it can never be left open by accident. The cycle itself is idempotent, so overlapping or repeated calls are harmless.
 * The response carries counts only, never business data.
 */
export async function POST(request: Request) {
  const secret = process.env.BILLING_CRON_SECRET;
  if (!secret || secret.length < 32) return new NextResponse("Not found", { status: 404 });
  if (!checkRateLimit(`billing-cron:${clientKeyFromHeaders(request.headers)}`, 10, 60_000).allowed) return new NextResponse("Too many requests", { status: 429 });

  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse("Unauthorized", { status: 401 });

  const summary = await new BillingService().runCycle();
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}

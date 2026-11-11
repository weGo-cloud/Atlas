import { after, NextResponse } from "next/server";

import { clientKeyFromHeaders } from "@/features/assistant/channels/web-channel";
import { BillingService } from "@/features/billing/service/billing-service";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Mission 041 — Safaricom's result callback for Atlas plan payments. Same layered defence as the per-business payments
 * callback (see api/payments/mpesa/callback): shape-checked secret path token, body-size and rate limits, one uniform
 * "Accepted" reply, and real verification (constant-time token compare, STK query, amount match, idempotent settle) in
 * BillingService.applyCallback after the response.
 */
const ACCEPTED = { ResultCode: 0, ResultDesc: "Accepted" };
const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[a-f0-9]{48}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  if (!checkRateLimit(`billing-cb-ip:${clientKeyFromHeaders(request.headers)}`, 120, 60_000).allowed) return new NextResponse("Too many requests", { status: 429 });

  const declared = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return new NextResponse("Payload too large", { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new NextResponse("Payload too large", { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  after(async () => {
    try {
      await new BillingService().applyCallback(token, body);
    } catch (error) {
      console.error("billing callback processing failed", error instanceof Error ? error.name : "unknown");
    }
  });
  return NextResponse.json(ACCEPTED);
}

import { after, NextResponse } from "next/server";

import { clientKeyFromHeaders } from "@/features/assistant/channels/web-channel";
import { getPaymentService } from "@/features/payments/service";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Mission 040 — Safaricom's STK-push result callback for one business.
 *
 * Safaricom does not sign callbacks, so authenticity comes from three layers (see PaymentService.applyStkCallback): the
 * unguessable per-business token in this URL, an independent STK query to Safaricom before any money is counted, and
 * idempotent compare-and-set status changes. This route adds the transport hygiene: strict shape checks on the path, a small
 * body limit, per-IP and per-business rate limits, and ONE uniform "Accepted" answer so scanners learn nothing about which
 * tokens/businesses exist. Real work happens after the response so Safaricom is never kept waiting.
 */
const ACCEPTED = { ResultCode: 0, ResultDesc: "Accepted" };
const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request, context: { params: Promise<{ businessId: string; token: string }> }) {
  const { businessId, token } = await context.params;
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(businessId) || !/^[a-f0-9]{48}$/.test(token)) return new NextResponse("Not found", { status: 404 });

  const ip = clientKeyFromHeaders(request.headers);
  if (!checkRateLimit(`mpesa-cb-ip:${ip}`, 120, 60_000).allowed || !checkRateLimit(`mpesa-cb-biz:${businessId}`, 600, 60_000).allowed) {
    return new NextResponse("Too many requests", { status: 429 });
  }

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
      await getPaymentService(businessId).applyStkCallback(token, body);
    } catch (error) {
      // Never log the body or token: only that processing failed.
      console.error("mpesa callback processing failed", error instanceof Error ? error.name : "unknown");
    }
  });
  return NextResponse.json(ACCEPTED);
}

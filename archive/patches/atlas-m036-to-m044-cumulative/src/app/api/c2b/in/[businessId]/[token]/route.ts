import { after, NextResponse } from "next/server";

import { clientKeyFromHeaders } from "@/features/assistant/channels/web-channel";
import { getPaymentService } from "@/features/payments/service";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Mission 043 — Safaricom's "a customer paid your till/paybill" confirmation (C2B). The path avoids the words Safaricom bans in
 * registered URLs. The notification is unsigned and can't be re-verified, so this route only ever STORES it in the owner's
 * inbox (never credits anything); same transport hygiene as the other callbacks: shape-checked path, size and rate limits, one
 * uniform "Accepted" reply, real checks (secret token, registered token, shortcode) after responding.
 */
const ACCEPTED = { ResultCode: 0, ResultDesc: "Accepted" };
const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request, context: { params: Promise<{ businessId: string; token: string }> }) {
  const { businessId, token } = await context.params;
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(businessId) || !/^[a-f0-9]{48}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  if (!checkRateLimit(`c2b-ip:${clientKeyFromHeaders(request.headers)}`, 120, 60_000).allowed || !checkRateLimit(`c2b-biz:${businessId}`, 600, 60_000).allowed) {
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
      await getPaymentService(businessId).receiveC2b(token, body);
    } catch (error) {
      console.error("c2b notification processing failed", error instanceof Error ? error.name : "unknown");
    }
  });
  return NextResponse.json(ACCEPTED);
}

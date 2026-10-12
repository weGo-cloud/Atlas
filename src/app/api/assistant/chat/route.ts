import { NextResponse } from "next/server";

import { getConversionService } from "@/features/conversion/service";
import { clientKeyFromHeaders, validateChatRequest } from "@/features/assistant/channels/web-channel";
import { checkRateLimit } from "@/features/assistant/lib/rate-limit";
import { getAssistantService } from "@/features/assistant/service/assistant-service";

/**
 * Mission 033 — the public website-chat endpoint used by the storefront
 * widget. Public by design (a storefront visitor has no session), so it
 * is defended in depth: strict body validation and size caps, per-IP and
 * per-conversation rate limits, the business must be entitled to the
 * storefront and have it enabled, and nothing in the request can choose
 * anything but the storefront's own business id.
 */
export async function POST(request: Request) {
  const clientKey = clientKeyFromHeaders(request.headers);
  const ipLimit = checkRateLimit(`assistant-ip:${clientKey}`, 30, 60_000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "You're sending messages very quickly. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } });
  }

  const raw = await request.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const validation = validateChatRequest(parsed, raw.length);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const { businessId, conversationId, message } = validation.value;

  if (conversationId) {
    const conversationLimit = checkRateLimit(`assistant-conv:${conversationId}`, 15, 60_000);
    if (!conversationLimit.allowed) {
      return NextResponse.json({ error: "You're sending messages very quickly. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(conversationLimit.retryAfterSeconds) } });
    }
  }

  const channel = await getConversionService().resolveChannel(businessId, "storefront");
  if (!channel.ok) return NextResponse.json({ error: "Chat isn't available right now." }, { status: 404 });

  const service = getAssistantService(businessId);

  // A conversation id is a bearer secret: it only resumes a website-chat conversation of this business.
  let customerKey = `web_${crypto.randomUUID()}`;
  if (conversationId) {
    const existing = await service.repo.getConversation(conversationId);
    if (existing && existing.channel === "website_chat") customerKey = existing.customerKey;
  }

  try {
    const outcome = await service.handleCustomerMessage({
      channel: "website_chat",
      customerKey,
      conversationId,
      text: message,
    });
    if (!outcome.ok) return NextResponse.json({ error: "Chat isn't available right now." }, { status: 404 });
    const { result } = outcome;
    return NextResponse.json({
      conversationId: result.conversationId,
      state: result.state,
      reply: result.reply,
      products: result.products,
      enquiryCreated: result.leadId !== null,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

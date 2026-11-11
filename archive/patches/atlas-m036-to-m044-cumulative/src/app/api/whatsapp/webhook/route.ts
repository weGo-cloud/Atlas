import { after, NextResponse } from "next/server";

import { parseWhatsAppPayload } from "@/features/assistant/channels/whatsapp/payload";
import { processInboundWhatsApp } from "@/features/assistant/channels/whatsapp/handler";
import { CloudApiWhatsAppSender } from "@/features/assistant/channels/whatsapp/sender";
import { resolveVerificationChallenge, verifyWhatsAppSignature } from "@/features/assistant/channels/whatsapp/signature";
import { DatabaseAssistantRepository } from "@/features/assistant/repository/database-assistant-repository";
import { getAssistantService } from "@/features/assistant/service/assistant-service";

/**
 * Mission 033 — WhatsApp Business Cloud API webhook (official API only).
 *
 * GET  — Meta's subscription handshake (WHATSAPP_VERIFY_TOKEN).
 * POST — inbound messages. The raw body's X-Hub-Signature-256 is
 *        verified against META_APP_SECRET before anything is parsed;
 *        we answer 200 immediately and do the (slower) model work after
 *        the response, so Meta doesn't time out and retry. Retries are
 *        harmless anyway: processing is idempotent on the message id.
 *
 * If the env vars aren't set, this endpoint reports itself unconfigured
 * (503) rather than pretending to accept traffic.
 */
export async function GET(request: Request) {
  const challenge = resolveVerificationChallenge(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
  if (challenge === null) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return NextResponse.json({ error: "WhatsApp webhook is not configured." }, { status: 503 });

  const raw = await request.text();
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const messages = parseWhatsAppPayload(body);
  if (messages.length > 0) {
    after(async () => {
      try {
        await processInboundWhatsApp(messages, {
          findBusinessId: (phoneNumberId) => DatabaseAssistantRepository.findBusinessIdByWhatsAppPhoneNumberId(phoneNumberId),
          getService: (businessId) => getAssistantService(businessId),
          sender: new CloudApiWhatsAppSender(),
          publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
          log: (message) => console.warn(message),
        });
      } catch (error) {
        console.error("whatsapp webhook processing failed", error instanceof Error ? error.message : "unknown error");
      }
    });
  }
  return NextResponse.json({ received: true });
}

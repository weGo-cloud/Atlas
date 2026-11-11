import { after, NextResponse } from "next/server";

import { processInboundMeta } from "@/features/assistant/channels/meta/handler";
import { parseMetaPayload } from "@/features/assistant/channels/meta/payload";
import { GraphMetaSender } from "@/features/assistant/channels/meta/sender";
import { resolveVerificationChallenge, verifyWhatsAppSignature } from "@/features/assistant/channels/whatsapp/signature";
import { DatabaseAssistantRepository } from "@/features/assistant/repository/database-assistant-repository";
import { getAssistantService } from "@/features/assistant/service/assistant-service";

/**
 * Mission 039 — Messenger + Instagram DM webhook (official Meta Messenger Platform only).
 *
 * GET  — Meta's subscription handshake (META_WEBHOOK_VERIFY_TOKEN, falling back to WHATSAPP_VERIFY_TOKEN).
 * POST — inbound DMs. X-Hub-Signature-256 over the RAW body is verified against META_APP_SECRET before anything is
 *        parsed; we answer 200 immediately and do the slower model work after the response so Meta doesn't time
 *        out and retry (retries are harmless anyway: processing is idempotent on the message id).
 * Unconfigured (no app secret) → 503, never pretending to accept traffic.
 */
export async function GET(request: Request) {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  const challenge = resolveVerificationChallenge(new URL(request.url).searchParams, token);
  if (challenge === null) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return NextResponse.json({ error: "Meta webhook is not configured." }, { status: 503 });

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

  const messages = parseMetaPayload(body);
  if (messages.length > 0) {
    after(async () => {
      try {
        await processInboundMeta(messages, {
          findRoute: (platform, accountId) => DatabaseAssistantRepository.findMetaRoute(platform, accountId),
          getService: (businessId) => getAssistantService(businessId),
          sender: new GraphMetaSender(),
          log: (message) => console.warn(message),
        });
      } catch (error) {
        console.error("meta webhook processing failed", error instanceof Error ? error.message : "unknown error");
      }
    });
  }
  return NextResponse.json({ received: true });
}

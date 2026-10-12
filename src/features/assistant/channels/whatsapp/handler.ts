import type { AssistantService } from "../../service/assistant-service";
import type { ProductCard } from "../../domain/types";
import type { InboundWhatsAppMessage } from "./payload";
import type { WhatsAppSender } from "./sender";

export type WhatsAppHandlerDeps = {
  findBusinessId: (phoneNumberId: string) => Promise<string | null>;
  getService: (businessId: string) => AssistantService;
  sender: WhatsAppSender;
  /** Absolute origin used to turn `/uploads/...` photo paths into links WhatsApp can fetch. Null → send text only. */
  publicBaseUrl: string | null;
  log?: (message: string) => void;
};

const OPT_OUT = /^\s*(stop|unsubscribe|acha)\s*[.!]?\s*$/i;
export const UNSUPPORTED_TYPE_REPLY = "Thanks for your message! I can only read text messages here — please type what you're looking for.";
export const OPT_OUT_REPLY = "Understood — I won't message you again unless you write to me first.";

function absoluteUrl(baseUrl: string | null, path: string | null): string | null {
  if (!baseUrl || !path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function safely(label: string, log: (m: string) => void, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    // Never log tokens or provider bodies — only which step failed.
    log(`whatsapp ${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

async function sendProducts(deps: WhatsAppHandlerDeps, businessId: string, phoneNumberId: string, to: string, products: ProductCard[]) {
  const log = deps.log ?? (() => {});
  for (const product of products) {
    const link = absoluteUrl(deps.publicBaseUrl, product.imageUrl);
    if (!link) continue;
    await safely("image", log, () => deps.sender.sendImage(businessId, phoneNumberId, to, link, `${product.name} — ${product.priceLabel}`));
  }
}

/**
 * Processes inbound WhatsApp messages: resolves the business from the
 * receiving number, runs the shared assistant engine, and replies with
 * text plus product photos. Idempotent (the engine dedupes on the
 * WhatsApp message id), so Meta's webhook retries are harmless.
 */
export async function processInboundWhatsApp(messages: InboundWhatsAppMessage[], deps: WhatsAppHandlerDeps): Promise<void> {
  const log = deps.log ?? (() => {});

  for (const message of messages) {
    const businessId = await deps.findBusinessId(message.phoneNumberId);
    if (!businessId) {
      log(`whatsapp: no business mapped to phone number id ${message.phoneNumberId}; ignoring message`);
      continue;
    }
    const service = deps.getService(businessId);
    const availability = await service.getAvailability();
    if (!availability.available) {
      log(`whatsapp: assistant unavailable for ${businessId} (${availability.reason}); ignoring message`);
      continue;
    }

    await safely("mark-read", log, () => deps.sender.markRead(businessId, message.phoneNumberId, message.messageId));

    // Non-text (images, audio, stickers…): answer once, without invoking the model.
    if (message.type !== "text" || !message.text) {
      const repo = service.repo;
      if (await repo.hasExternalId(message.messageId)) continue;
      const conversation =
        (await repo.findActiveConversation("whatsapp", message.from)) ??
        (await repo.createConversation({ channel: "whatsapp", customerKey: message.from, customerName: message.profileName }));
      const stored = await repo.appendMessage({ conversationId: conversation.id, role: "customer", content: `[${message.type} message]`, externalId: message.messageId });
      if (!stored) continue;
      if (conversation.state !== "human") {
        await repo.appendMessage({ conversationId: conversation.id, role: "assistant", content: UNSUPPORTED_TYPE_REPLY });
        await safely("send", log, () => deps.sender.sendText(businessId, message.phoneNumberId, message.from, UNSUPPORTED_TYPE_REPLY));
      }
      continue;
    }

    // Opt-out: confirm and close; we only ever reply to inbound messages, so nothing further is sent.
    if (OPT_OUT.test(message.text)) {
      const repo = service.repo;
      if (await repo.hasExternalId(message.messageId)) continue;
      const conversation =
        (await repo.findActiveConversation("whatsapp", message.from)) ??
        (await repo.createConversation({ channel: "whatsapp", customerKey: message.from, customerName: message.profileName }));
      const stored = await repo.appendMessage({ conversationId: conversation.id, role: "customer", content: message.text, externalId: message.messageId });
      if (!stored) continue;
      await repo.updateConversation(conversation.id, { state: "closed" });
      await repo.appendMessage({ conversationId: conversation.id, role: "assistant", content: OPT_OUT_REPLY });
      await safely("send", log, () => deps.sender.sendText(businessId, message.phoneNumberId, message.from, OPT_OUT_REPLY));
      continue;
    }

    const outcome = await service.handleCustomerMessage({
      channel: "whatsapp",
      customerKey: message.from,
      text: message.text,
      externalId: message.messageId,
      customerName: message.profileName,
    });
    if (!outcome.ok || outcome.result.duplicate || outcome.result.reply === null) continue;

    await safely("send", log, () => deps.sender.sendText(businessId, message.phoneNumberId, message.from, outcome.result.reply as string));
    await sendProducts(deps, businessId, message.phoneNumberId, message.from, outcome.result.products);
  }
}

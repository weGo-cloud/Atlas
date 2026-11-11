import { checkRateLimit } from "@/lib/security/rate-limit";
import { MAX_CUSTOMER_MESSAGE_CHARS } from "../../domain/types";
import type { AssistantService } from "../../service/assistant-service";
import type { InboundMetaMessage, MetaPlatform } from "./payload";
import type { MetaSender } from "./sender";

export type MetaHandlerDeps = {
  findRoute: (platform: MetaPlatform, accountId: string) => Promise<{ businessId: string; pageId: string } | null>;
  getService: (businessId: string) => AssistantService;
  sender: MetaSender;
  log?: (message: string) => void;
};

const OPT_OUT = /^\s*(stop|unsubscribe|acha)\s*[.!]?\s*$/i;
export const META_UNSUPPORTED_REPLY = "Thanks for your message! I can only read text messages here, so please type what you're looking for.";
export const META_LIMIT_REACHED_REPLY = "Thanks for your message! Our automatic assistant is unavailable for the rest of today, but the team will reply to you personally.";
export const META_OPT_OUT_REPLY = "Understood. I won't message you again unless you write to me first.";

async function safely(label: string, log: (m: string) => void, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    // Never log tokens or provider bodies; only which step failed.
    log(`meta ${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

/**
 * Mission 039 — processes inbound Messenger / Instagram DMs with the SAME assistant engine, entitlement gate,
 * daily plan allowance and lead handoff as web chat and WhatsApp. Idempotent on the message id (Meta retries
 * webhooks), per-sender rate limited, and it only ever replies to an inbound message.
 */
export async function processInboundMeta(messages: InboundMetaMessage[], deps: MetaHandlerDeps): Promise<void> {
  const log = deps.log ?? (() => {});

  for (const message of messages) {
    const route = await deps.findRoute(message.platform, message.accountId);
    if (!route) {
      log(`meta: no business mapped to ${message.platform} account ${message.accountId}; ignoring message`);
      continue;
    }
    const { businessId, pageId } = route;
    const service = deps.getService(businessId);

    const availability = await service.getAvailability();
    if (!availability.available) {
      log(`meta: assistant unavailable for ${businessId} (${availability.reason}); ignoring message`);
      continue;
    }

    // Per-customer burst limit: a person (or bot) hammering one DM thread can't drive cost or flood the team.
    if (!checkRateLimit(`meta-sender:${message.platform}:${message.senderId}`, 10, 60_000).allowed) continue;

    const reply = (text: string) => safely("send", log, () => deps.sender.sendText(businessId, pageId, message.senderId, text));

    if (message.text === null) {
      // Images, voice notes, stickers, etc.: say so at most once an hour per customer; no model call.
      if (checkRateLimit(`meta-unsupported:${message.platform}:${message.senderId}`, 1, 60 * 60_000).allowed) await reply(META_UNSUPPORTED_REPLY);
      continue;
    }

    if (OPT_OUT.test(message.text)) {
      const repo = service.repo;
      if (await repo.hasExternalId(message.messageId)) continue;
      const conversation =
        (await repo.findActiveConversation(message.platform, message.senderId)) ??
        (await repo.createConversation({ channel: message.platform, customerKey: message.senderId }));
      const stored = await repo.appendMessage({ conversationId: conversation.id, role: "customer", content: message.text, externalId: message.messageId });
      if (!stored) continue;
      await repo.updateConversation(conversation.id, { state: "closed" });
      await repo.appendMessage({ conversationId: conversation.id, role: "assistant", content: META_OPT_OUT_REPLY });
      await reply(META_OPT_OUT_REPLY);
      continue;
    }

    const outcome = await service.handleCustomerMessage({
      channel: message.platform,
      customerKey: message.senderId,
      text: message.text.slice(0, MAX_CUSTOMER_MESSAGE_CHARS),
      externalId: message.messageId,
    });
    if (!outcome.ok) {
      if (outcome.reason === "limit_reached" && checkRateLimit(`meta-limit-notice:${businessId}:${message.senderId}`, 1, 60 * 60_000).allowed) {
        await reply(META_LIMIT_REACHED_REPLY);
      }
      continue;
    }
    if (outcome.result.duplicate || outcome.result.reply === null) continue;
    await reply(outcome.result.reply);
  }
}

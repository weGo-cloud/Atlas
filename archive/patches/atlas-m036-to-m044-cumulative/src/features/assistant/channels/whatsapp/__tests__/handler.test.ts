import { describe, expect, it, vi } from "vitest";

import type { AssistantService } from "../../../service/assistant-service";
import { OPT_OUT_REPLY, UNSUPPORTED_TYPE_REPLY, processInboundWhatsApp } from "../handler";
import type { InboundWhatsAppMessage } from "../payload";
import type { WhatsAppSender } from "../sender";

function fakeSender() {
  return {
    markRead: vi.fn(async () => {}),
    sendText: vi.fn(async () => {}),
    sendImage: vi.fn(async () => {}),
  } satisfies WhatsAppSender;
}

/** A minimal in-memory AssistantService stand-in — enough for the handler's contract. */
function fakeService(opts: {
  available?: boolean;
  reason?: "not_configured" | "disabled";
  reply?: string | null;
  products?: Array<{ imageUrl: string | null }>;
  duplicate?: boolean;
}) {
  const messages: Array<{ conversationId: string; role: string; content: string; externalId?: string | null }> = [];
  const conversations = new Map<string, { id: string; state: string }>();
  const externalIds = new Set<string>();
  let counter = 0;

  const repo = {
    hasExternalId: async (id: string) => externalIds.has(id),
    findActiveConversation: async (_channel: string, customerKey: string) => conversations.get(customerKey) ? { ...conversations.get(customerKey)!, customerKey } : null,
    createConversation: async ({ customerKey }: { customerKey: string }) => {
      counter += 1;
      const conversation = { id: `conv_${counter}`, state: "bot", customerKey };
      conversations.set(customerKey, conversation);
      return conversation;
    },
    appendMessage: async (input: { conversationId: string; role: string; content: string; externalId?: string | null }) => {
      if (input.externalId) {
        if (externalIds.has(input.externalId)) return null;
        externalIds.add(input.externalId);
      }
      messages.push(input);
      return { id: `m_${messages.length}`, ...input };
    },
    updateConversation: async (id: string, patch: { state?: string }) => {
      for (const conversation of conversations.values()) if (conversation.id === id && patch.state) conversation.state = patch.state;
    },
  };

  const service = {
    getAvailability: async () => (opts.available === false ? { available: false, reason: opts.reason ?? "not_configured" } : { available: true }),
    repo,
    handleCustomerMessage: vi.fn(async () => ({
      ok: true,
      result: { conversationId: "conv_x", state: "bot", reply: opts.reply ?? "Hi there!", products: opts.products ?? [], leadId: null, duplicate: opts.duplicate ?? false, events: [] },
    })),
  };
  return { service: service as unknown as AssistantService, messages, conversations, externalIds };
}

function inbound(overrides: Partial<InboundWhatsAppMessage> = {}): InboundWhatsAppMessage {
  return { phoneNumberId: "1000", from: "254700000001", messageId: "wamid.A", type: "text", text: "hi", profileName: "Test Customer", ...overrides };
}

describe("processInboundWhatsApp", () => {
  it("ignores a phone number id with no mapped business", async () => {
    const sender = fakeSender();
    await processInboundWhatsApp([inbound()], { findBusinessId: async () => null, getService: () => { throw new Error("should not be called"); }, sender, publicBaseUrl: null });
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it("ignores messages when the assistant is unavailable for that business", async () => {
    const { service } = fakeService({ available: false });
    const sender = fakeSender();
    await processInboundWhatsApp([inbound()], { findBusinessId: async () => "biz_1", getService: () => service, sender, publicBaseUrl: null });
    expect(sender.sendText).not.toHaveBeenCalled();
    expect(sender.markRead).not.toHaveBeenCalled();
  });

  it("marks read, calls the engine, and sends the reply plus product images", async () => {
    const { service } = fakeService({ reply: "Here are two options.", products: [{ imageUrl: "/uploads/a.png" }, { imageUrl: null }] });
    const sender = fakeSender();
    await processInboundWhatsApp([inbound()], { findBusinessId: async () => "biz_1", getService: () => service, sender, publicBaseUrl: "https://demo.example.com" });
    expect(sender.markRead).toHaveBeenCalledWith("biz_1", "1000", "wamid.A");
    expect(sender.sendText).toHaveBeenCalledWith("biz_1", "1000", "254700000001", "Here are two options.");
    expect(sender.sendImage).toHaveBeenCalledTimes(1);
    expect(sender.sendImage).toHaveBeenCalledWith("biz_1", "1000", "254700000001", "https://demo.example.com/uploads/a.png", expect.any(String));
  });

  it("replies once to a non-text message without invoking the model", async () => {
    const { service } = fakeService({});
    const sender = fakeSender();
    await processInboundWhatsApp([inbound({ type: "image", text: null })], { findBusinessId: async () => "biz_1", getService: () => service, sender, publicBaseUrl: null });
    expect(service.handleCustomerMessage).not.toHaveBeenCalled();
    expect(sender.sendText).toHaveBeenCalledWith("biz_1", "1000", "254700000001", UNSUPPORTED_TYPE_REPLY);
  });

  it("confirms and closes on an opt-out keyword, never messaging again unprompted", async () => {
    const { service } = fakeService({});
    const sender = fakeSender();
    await processInboundWhatsApp([inbound({ text: "STOP" })], { findBusinessId: async () => "biz_1", getService: () => service, sender, publicBaseUrl: null });
    expect(service.handleCustomerMessage).not.toHaveBeenCalled();
    expect(sender.sendText).toHaveBeenCalledWith("biz_1", "1000", "254700000001", OPT_OUT_REPLY);
  });

  it("never sends a message for a duplicate delivery of the same message id", async () => {
    const { service } = fakeService({ duplicate: true });
    const sender = fakeSender();
    await processInboundWhatsApp([inbound()], { findBusinessId: async () => "biz_1", getService: () => service, sender, publicBaseUrl: null });
    expect(sender.sendText).not.toHaveBeenCalled();
  });

  it("does not throw when the sender itself fails (e.g. not connected)", async () => {
    const { service } = fakeService({ reply: "hi" });
    const sender = fakeSender();
    sender.sendText.mockRejectedValueOnce(new Error("WhatsApp is not connected for this business."));
    await expect(processInboundWhatsApp([inbound()], { findBusinessId: async () => "biz_1", getService: () => service, sender, publicBaseUrl: null })).resolves.toBeUndefined();
  });
});

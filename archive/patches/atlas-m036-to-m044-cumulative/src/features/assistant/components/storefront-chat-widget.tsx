"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductCard } from "../domain/types";
import { ChatPanel, type ChatMessage, type ChatSendResult } from "./chat-panel";

type StoredChat = { conversationId: string | null; messages: ChatMessage[] };

function storageKey(businessId: string) {
  return `atlas-chat:${businessId}`;
}

function loadStored(businessId: string): StoredChat {
  try {
    const raw = window.sessionStorage.getItem(storageKey(businessId));
    if (raw) {
      const parsed = JSON.parse(raw) as StoredChat;
      if (Array.isArray(parsed.messages)) return { conversationId: parsed.conversationId ?? null, messages: parsed.messages.slice(-60) };
    }
  } catch {
    /* sessionStorage unavailable or corrupt — start fresh */
  }
  return { conversationId: null, messages: [] };
}

/**
 * Floating chat launcher + panel for the public storefront. The
 * conversation id and transcript live in sessionStorage so a refresh
 * doesn't lose the thread. "Enquire" hands the chosen piece to the
 * storefront's existing enquiry form via a window event, so the lead
 * still flows through the exact same public-lead path.
 */
export function StorefrontChatWidget({ businessId, businessName, greeting }: { businessId: string; businessName: string; greeting: string }) {
  const [open, setOpen] = useState(false);
  // Lazy-init from sessionStorage — reading it directly in render (guarded by the
  // typeof window check inside loadStored's try/catch) avoids a synchronous
  // setState-in-effect, and businessId is stable for the life of this page.
  const [chat, setChat] = useState<StoredChat>(() => (typeof window === "undefined" ? { conversationId: null, messages: [] } : loadStored(businessId)));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey(businessId), JSON.stringify(chat));
    } catch {
      /* ignore */
    }
  }, [businessId, chat]);

  async function send(text: string, conversationId: string | null): Promise<ChatSendResult> {
    const response = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId, conversationId, message: text }),
    });
    const data = (await response.json().catch(() => null)) as
      | { error?: string; conversationId?: string; reply?: string | null; products?: ProductCard[]; state?: string }
      | null;
    if (!response.ok || !data?.conversationId) {
      return { ok: false, error: data?.error ?? "Something went wrong. Please try again." };
    }
    return { ok: true, conversationId: data.conversationId, reply: data.reply ?? null, products: data.products ?? [], state: data.state ?? "bot" };
  }

  function enquire(product: ProductCard) {
    window.dispatchEvent(new CustomEvent("atlas:enquire-item", { detail: { itemId: product.id } }));
    setOpen(false);
  }

  return (
    <>
      {open ? (
        <section
          aria-label={`Chat with ${businessName}`}
          className="fixed bottom-20 right-3 z-40 flex h-[min(36rem,calc(100dvh-6.5rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg sm:right-5"
        >
          <div className="flex items-center justify-end border-b border-border bg-surface px-2 py-1">
            <Button variant="ghost" size="icon" aria-label="Close chat" onClick={() => setOpen(false)} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ChatPanel
            className="flex-1"
            title={`${businessName} assistant`}
            subtitle="Ask about our pieces — powered by AI"
            greeting={greeting}
            messages={chat.messages}
            onMessagesChange={(messages) => setChat((current) => ({ ...current, messages }))}
            conversationId={chat.conversationId}
            onConversationId={(conversationId) => setChat((current) => ({ ...current, conversationId }))}
            send={send}
            onEnquire={enquire}
          />
        </section>
      ) : null}
      <Button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Chat with us"}
        className="fixed bottom-4 right-3 z-40 h-12 gap-2 rounded-full px-5 shadow-lg sm:right-5"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="hidden sm:inline">Chat with us</span>
      </Button>
    </>
  );
}

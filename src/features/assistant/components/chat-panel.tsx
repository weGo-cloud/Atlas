"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProductCard } from "../domain/types";

export type ChatMessage = {
  id: string;
  from: "customer" | "assistant" | "notice";
  text: string;
  products?: ProductCard[];
};

export type ChatSendResult =
  | { ok: true; conversationId: string; reply: string | null; products: ProductCard[]; state: string }
  | { ok: false; error: string };

type ChatPanelProps = {
  title: string;
  subtitle?: string;
  greeting: string;
  variant?: "web" | "whatsapp";
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  conversationId: string | null;
  onConversationId: (id: string) => void;
  send: (text: string, conversationId: string | null) => Promise<ChatSendResult>;
  onEnquire?: (product: ProductCard) => void;
  className?: string;
};

const STATUS_VARIANT = { available: "success", reserved: "warning", sold: "default" } as const;
const STATUS_LABEL = { available: "Available", reserved: "Reserved", sold: "Sold" } as const;

function newId() {
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function ProductCardView({ product, onEnquire }: { product: ProductCard; onEnquire?: (product: ProductCard) => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
      {product.imageUrl ? (
        <div className="aspect-[16/10] w-full overflow-hidden bg-surface-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1.5 p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold leading-snug text-foreground">{product.name}</p>
          <Badge variant={STATUS_VARIANT[product.status]} dot className="shrink-0">
            {STATUS_LABEL[product.status]}
          </Badge>
        </div>
        <p className="text-sm font-semibold tabular text-foreground">{product.priceLabel}</p>
        {product.material || product.color || product.dimensions ? (
          <p className="text-xs text-muted-foreground">
            {[product.material, product.color, product.dimensions].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {onEnquire && product.status !== "sold" ? (
          <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={() => onEnquire(product)}>
            Enquire about this
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The shared chat UI: used by the storefront widget and the demo
 * simulator. It owns only presentation and the send/receive loop —
 * transport is the `send` prop, so it never knows which channel it's on.
 */
export function ChatPanel({
  title,
  subtitle,
  greeting,
  variant = "web",
  messages,
  onMessagesChange,
  conversationId,
  onConversationId,
  send,
  onEnquire,
  className,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    const withCustomer: ChatMessage[] = [...messagesRef.current, { id: newId(), from: "customer", text }];
    onMessagesChange(withCustomer);
    setSending(true);
    try {
      const result = await send(text, conversationId);
      if (!result.ok) {
        onMessagesChange([...withCustomer, { id: newId(), from: "notice", text: result.error }]);
        return;
      }
      onConversationId(result.conversationId);
      if (result.reply) {
        onMessagesChange([...withCustomer, { id: newId(), from: "assistant", text: result.reply, products: result.products }]);
      } else if (result.state === "human") {
        onMessagesChange([...withCustomer, { id: newId(), from: "notice", text: "The team has your message and will get back to you." }]);
      }
    } catch {
      onMessagesChange([...withCustomer, { id: newId(), from: "notice", text: "Couldn't reach the assistant. Check your connection and try again." }]);
    } finally {
      setSending(false);
    }
  }

  const whatsapp = variant === "whatsapp";

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden bg-background", className)}>
      <header className={cn("flex items-center gap-3 border-b border-border px-4 py-3", whatsapp ? "bg-success/10" : "bg-surface")}>
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </header>

      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className={cn("scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-3 py-4", whatsapp && "bg-surface-2")}
      >
        <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground shadow-xs">
          {greeting}
        </div>

        {messages.map((message) => {
          if (message.from === "notice") {
            return (
              <p key={message.id} role="status" className="self-center rounded-full bg-surface-3 px-3 py-1 text-center text-xs text-muted-foreground">
                {message.text}
              </p>
            );
          }
          const mine = message.from === "customer";
          return (
            <div key={message.id} className={cn("flex min-w-0 max-w-[88%] flex-col gap-2", mine ? "self-end" : "self-start")}>
              <div
                className={cn(
                  "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm shadow-xs",
                  mine
                    ? cn("rounded-tr-sm", whatsapp ? "bg-success/20 text-foreground" : "bg-primary text-primary-foreground")
                    : "rounded-tl-sm border border-border bg-surface text-foreground"
                )}
              >
                {message.text}
              </div>
              {message.products && message.products.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {message.products.map((product) => (
                    <ProductCardView key={product.id} product={product} onEnquire={onEnquire} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {sending ? (
          <div role="status" aria-label="Assistant is typing" className="flex w-fit items-center gap-1 self-start rounded-2xl rounded-tl-sm border border-border bg-surface px-3.5 py-3">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="h-1.5 w-1.5 animate-pulse rounded-full bg-subtle-foreground" style={{ animationDelay: `${dot * 150}ms` }} />
            ))}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border bg-surface p-3">
        <label htmlFor="assistant-chat-input" className="sr-only">
          Type your message
        </label>
        <textarea
          id="assistant-chat-input"
          rows={1}
          value={draft}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Type your message…"
          className="max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <Button size="icon" onClick={() => void handleSend()} disabled={sending || draft.trim() === ""} aria-label="Send message">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

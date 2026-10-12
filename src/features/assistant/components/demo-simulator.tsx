"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendDemoMessageAction } from "../actions/assistant-actions";
import { ChatPanel, type ChatMessage, type ChatSendResult } from "./chat-panel";

function newSessionKey() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/**
 * A phone-frame, WhatsApp-styled chat for demonstrating Atlas Assistant
 * before a WhatsApp Business number is connected. It is the real
 * assistant — same engine, model, inventory and lead creation — and is
 * labelled as a simulation everywhere it appears: it never fakes
 * delivery ticks or pretends to be a live WhatsApp number.
 */
export function DemoSimulator({ greeting, businessName }: { greeting: string; businessName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(newSessionKey);

  async function send(text: string, currentConversationId: string | null): Promise<ChatSendResult> {
    const result = await sendDemoMessageAction({ text, conversationId: currentConversationId, sessionKey });
    return result;
  }

  function reset() {
    setMessages([]);
    setConversationId(null);
    setSessionKey(newSessionKey());
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3">
      <div className="w-full rounded-[2rem] border-[10px] border-foreground/85 bg-surface shadow-lg">
        <div className="flex h-[min(36rem,calc(100dvh-16rem))] min-h-[26rem] flex-col overflow-hidden rounded-[1.4rem]">
          <ChatPanel
            className="flex-1"
            variant="whatsapp"
            title={`${businessName} assistant`}
            subtitle="Demo simulation — not connected to WhatsApp"
            greeting={greeting}
            messages={messages}
            onMessagesChange={setMessages}
            conversationId={conversationId}
            onConversationId={setConversationId}
            send={send}
          />
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
        <RotateCcw className="h-3.5 w-3.5" />
        Start a new conversation
      </Button>
    </div>
  );
}

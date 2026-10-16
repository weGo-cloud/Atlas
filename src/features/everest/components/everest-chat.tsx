"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Mountain, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelEverestActionAction,
  confirmEverestActionAction,
  refreshEverestStateAction,
  sendEverestMessageAction,
  type EverestActionResult,
} from "../actions/everest-actions";
import { EVEREST_GREETING } from "../domain/panel-preferences";
import { MAX_INPUT_CHARS } from "../domain/thresholds";
import type { ChatMessage, PendingAction } from "../domain/types";
import type { EverestOverview, ConversationState } from "../service/everest-service";

type Props = { everestName: string; overview: EverestOverview };

export function EverestChat({ everestName, overview }: Props) {
  const [state, setState] = useState<ConversationState>(overview.state);
  const [used, setUsed] = useState(overview.usage.used);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const [isActing, startActing] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const limit = overview.usage.limit;
  const blocked = !overview.configured || !overview.access.allowed;
  const atLimit = limit !== null && used >= limit;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.messages.length, state.pendingActions.length, isSending]);

  function apply(result: EverestActionResult, countsAsMessage: boolean) {
    if (result.ok) {
      setState(result.state);
      setError(null);
      if (countsAsMessage) setUsed((value) => value + 1);
    } else {
      setError(result.error.message);
    }
  }

  function send() {
    const text = draft.trim();
    if (!text || isSending || blocked || atLimit) return;
    setDraft("");
    setError(null);
    // Show the person's message straight away while the reply is being prepared.
    setState((current) => ({
      ...current,
      messages: [...current.messages, { id: `local_${Date.now()}`, conversationId: current.conversation?.id ?? "", role: "user", content: text, createdAt: new Date().toISOString() }],
    }));
    startSending(async () => {
      const result = await sendEverestMessageAction(state.conversation?.id ?? null, text);
      if (!result.ok) {
        // Roll the optimistic message back and give the text back so nothing is lost.
        setState((current) => ({ ...current, messages: current.messages.filter((m) => !m.id.startsWith("local_")) }));
        setDraft(text);
      }
      apply(result, true);
    });
  }

  function act(kind: "confirm" | "cancel", id: string) {
    setBusyActionId(id);
    startActing(async () => {
      const result = kind === "confirm" ? await confirmEverestActionAction(id) : await cancelEverestActionAction(id);
      if (!result.ok && (result.error.code === "ACTION_EXPIRED" || result.error.code === "ACTION_NOT_PENDING")) {
        const refreshed = await refreshEverestStateAction(state.conversation?.id ?? null);
        if (refreshed.ok) setState(refreshed.state);
      }
      apply(result, false);
      setBusyActionId(null);
    });
  }

  function newChat() {
    setState({ conversation: null, messages: [], pendingActions: [] });
    setError(null);
  }

  const cardsByMessage = new Map<string, PendingAction[]>();
  const orphanCards: PendingAction[] = [];
  for (const action of state.pendingActions) {
    if (action.messageId && state.messages.some((m) => m.id === action.messageId)) {
      cardsByMessage.set(action.messageId, [...(cardsByMessage.get(action.messageId) ?? []), action]);
    } else {
      orphanCards.push(action);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>
          {limit !== null ? `${Math.max(0, limit - used)} of ${limit} messages left this month` : `${used} messages this month`}
        </span>
        <Button variant="ghost" size="sm" onClick={newChat} disabled={isSending || state.messages.length === 0}>
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {!overview.configured ? (
          <Notice>
            {everestName} isn&apos;t set up yet — the AI service key hasn&apos;t been added to this installation. Ask whoever manages Atlas to add it.
          </Notice>
        ) : null}
        {overview.configured && !overview.access.allowed ? <Notice>{overview.access.message}</Notice> : null}
        {state.messages.length === 0 && !blocked ? (
          <div className="flex flex-col items-center gap-3 px-2 py-6 text-center text-sm text-muted-foreground">
            <Mountain className="h-8 w-8" aria-hidden />
            <p className="text-foreground">{EVEREST_GREETING.intro}</p>
            <p>{EVEREST_GREETING.outro}</p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {EVEREST_GREETING.examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => setDraft(example)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <Bubble message={message} />
            {(cardsByMessage.get(message.id) ?? []).map((action) => (
              <ActionCard key={action.id} action={action} busy={busyActionId === action.id && isActing} disabled={isActing} onAct={act} />
            ))}
          </div>
        ))}
        {orphanCards.map((action) => (
          <ActionCard key={action.id} action={action} busy={busyActionId === action.id && isActing} disabled={isActing} onAct={act} />
        ))}
        {isSending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {everestName} is thinking…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-3">
        {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
        {atLimit && !blocked ? <p className="mb-2 text-sm text-warning">You&apos;ve used this month&apos;s {everestName} messages. They reset next month.</p> : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            maxLength={MAX_INPUT_CHARS}
            placeholder={`Message ${everestName}…`}
            className="min-h-11 max-h-40"
            rows={2}
            disabled={blocked || atLimit}
            aria-label={`Message ${everestName}`}
          />
          <Button onClick={send} disabled={!draft.trim() || isSending || blocked || atLimit} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">{children}</p>;
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${
          mine ? "bg-primary text-primary-foreground" : "border border-border bg-surface-2 text-foreground"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

function ActionCard({
  action,
  busy,
  disabled,
  onAct,
}: {
  action: PendingAction;
  busy: boolean;
  disabled: boolean;
  onAct: (kind: "confirm" | "cancel", id: string) => void;
}) {
  const destructive = action.toolName === "delete_items";
  const pending = action.status === "pending";
  return (
    <div className={`ml-0 max-w-[95%] rounded-lg border p-3 text-sm ${destructive ? "border-destructive/50" : "border-border-strong"} bg-surface`}>
      <p className="font-medium">{action.summary}</p>
      {action.changes.length > 0 ? (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
          {action.changes.map((line, index) => (
            <li key={`${line.label}-${index}`} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">{line.label}:</span>
              {line.before !== null ? <span className="text-muted-foreground line-through">{line.before}</span> : null}
              <span>{line.after ?? "—"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {pending ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant={destructive ? "destructive" : "default"} disabled={disabled} onClick={() => onAct("confirm", action.id)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {destructive ? "Delete" : "Confirm"}
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAct("cancel", action.id)}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {action.status === "confirmed"
            ? action.resultOk === false
              ? "Confirmed, but it didn't fully go through."
              : "Confirmed and done."
            : action.status === "cancelled"
              ? "Cancelled — nothing was changed."
              : "Expired — nothing was changed."}
        </p>
      )}
    </div>
  );
}

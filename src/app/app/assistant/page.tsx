import Link from "next/link";
import { AlertTriangle, CheckCircle2, MessageSquare, ShieldAlert, UserRoundCheck } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { deleteConversationAction, setConversationStateAction } from "@/features/assistant/actions/assistant-actions";
import {
  CONVERSATION_CHANNELS,
  CONVERSATION_CHANNEL_LABEL,
  CONVERSATION_STATE_LABEL,
  type AssistantConversation,
  type ConversationChannel,
  type ConversationState,
} from "@/features/assistant/domain/types";
import { getAssistantService, type UnavailableReason } from "@/features/assistant/service/assistant-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Assistant" };

const UNAVAILABLE_TEXT: Record<UnavailableReason, string> = {
  business_not_found: "This business could not be found.",
  unsupported_vertical: "Atlas Assistant currently supports furniture businesses.",
  disabled: "The assistant is switched off. Turn it on in Settings.",
  not_configured: "The AI isn't configured yet: set ANTHROPIC_API_KEY on the server. Until then customers won't see the chat, and nothing pretends to be AI.",
};

const STATE_VARIANT = { bot: "intelligence", human: "warning", closed: "default" } as const;

function formatWhen(iso: string): string {
  const date = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}

function who(conversation: AssistantConversation): string {
  if (conversation.customerName) return conversation.customerName;
  if (conversation.channel === "whatsapp") return conversation.customerKey;
  return conversation.channel === "simulated" ? "Demo conversation" : "Website visitor";
}

type SearchParams = { channel?: string; state?: string; lead?: string; c?: string };

function buildHref(params: SearchParams, patch: Partial<SearchParams>): string {
  const merged = { ...params, ...patch };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value) query.set(key, value);
  const qs = query.toString();
  return qs ? `/app/assistant?${qs}` : "/app/assistant";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { business } = await requireCurrentSession();
  const service = getAssistantService(business.id);
  const repo = service.repo;

  const availability = await service.getAvailability();
  const metrics = await repo.metrics();

  const channel = CONVERSATION_CHANNELS.find((value) => value === params.channel) as ConversationChannel | undefined;
  const state = (["bot", "human", "closed"] as const).find((value) => value === params.state) as ConversationState | undefined;
  const hasLead = params.lead === "yes" ? true : params.lead === "no" ? false : undefined;

  const conversations = await repo.listConversations({ channel, state, hasLead, limit: 50 });
  const selected = params.c ? await repo.getConversation(params.c) : null;
  const messages = selected ? await repo.listMessages(selected.id, 200) : [];

  return (
    <div className="flex flex-col gap-6">
      {availability.available ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
          The assistant is live for customers.
        </p>
      ) : (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{UNAVAILABLE_TEXT[availability.reason]}</p>
        </div>
      )}

      <section aria-label="Assistant metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Conversations" value={String(metrics.conversations)} icon={MessageSquare} />
        <StatCard label="Enquiries created" value={String(metrics.enquiries)} icon={UserRoundCheck} />
        <StatCard label="Team takeovers" value={String(metrics.humanTakeovers)} icon={UserRoundCheck} />
        <StatCard label="Answers blocked by the fact check" value={String(metrics.groundingFailures)} hint="Replies caught before reaching a customer" icon={ShieldAlert} />
      </section>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by channel">
          <Chip href={buildHref(params, { channel: undefined, c: undefined })} active={!channel}>All channels</Chip>
          {CONVERSATION_CHANNELS.map((value) => (
            <Chip key={value} href={buildHref(params, { channel: value, c: undefined })} active={channel === value}>
              {CONVERSATION_CHANNEL_LABEL[value]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by state">
          <Chip href={buildHref(params, { state: undefined, c: undefined })} active={!state}>Any state</Chip>
          {(["bot", "human", "closed"] as const).map((value) => (
            <Chip key={value} href={buildHref(params, { state: value, c: undefined })} active={state === value}>
              {CONVERSATION_STATE_LABEL[value]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by enquiry">
          <Chip href={buildHref(params, { lead: undefined, c: undefined })} active={hasLead === undefined}>Any</Chip>
          <Chip href={buildHref(params, { lead: "yes", c: undefined })} active={hasLead === true}>Has enquiry</Chip>
          <Chip href={buildHref(params, { lead: "no", c: undefined })} active={hasLead === false}>No enquiry</Chip>
        </div>
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Conversations from your website chat, WhatsApp and the demo will appear here."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/app/assistant/demo">Try the demo</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 [&>*]:min-w-0">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border border-t border-border">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={buildHref(params, { c: conversation.id })}
                    aria-current={selected?.id === conversation.id ? "true" : undefined}
                    className={cn(
                      "flex min-w-0 flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5",
                      selected?.id === conversation.id && "bg-primary/5"
                    )}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{who(conversation)}</span>
                      <Badge variant={STATE_VARIANT[conversation.state]} className="shrink-0">
                        {CONVERSATION_STATE_LABEL[conversation.state]}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{CONVERSATION_CHANNEL_LABEL[conversation.channel]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatWhen(conversation.updatedAt)}</span>
                      {conversation.leadId ? <Badge variant="success">Enquiry</Badge> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="lg:col-span-3">
            {selected ? (
              <>
                <CardHeader className="gap-3">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{who(selected)}</CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {CONVERSATION_CHANNEL_LABEL[selected.channel]} · started {formatWhen(selected.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selected.leadId ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/leads/${selected.leadId}`}>View lead</Link>
                        </Button>
                      ) : null}
                      {(["human", "bot", "closed"] as const)
                        .filter((value) => value !== selected.state)
                        .map((value) => (
                          <form key={value} action={setConversationStateAction}>
                            <input type="hidden" name="conversationId" value={selected.id} />
                            <input type="hidden" name="state" value={value} />
                            <Button type="submit" size="sm" variant={value === "human" ? "default" : "outline"}>
                              {value === "human" ? "Take over" : value === "bot" ? "Hand back to assistant" : "Close"}
                            </Button>
                          </form>
                        ))}
                      <form action={deleteConversationAction}>
                        <input type="hidden" name="conversationId" value={selected.id} />
                        <Button type="submit" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10">
                          Delete
                        </Button>
                      </form>
                    </div>
                  </div>
                  {Object.keys(selected.context.profile).length > 0 ? (
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
                      {Object.entries(selected.context.profile).map(([key, value]) => (
                        <div key={key} className="flex gap-1">
                          <dt className="text-muted-foreground">{key}:</dt>
                          <dd className="font-medium text-foreground">{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-2.5" aria-label="Transcript">
                    {messages.map((message) => (
                      <li key={message.id} className={cn("flex min-w-0 flex-col gap-1", message.role === "customer" ? "items-start" : "items-end")}>
                        <div
                          className={cn(
                            "max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                            message.role === "customer" ? "rounded-tl-sm bg-surface-2 text-foreground" : "rounded-tr-sm bg-intelligence/10 text-foreground"
                          )}
                        >
                          {message.content}
                        </div>
                        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-subtle-foreground">
                          {message.role === "customer" ? "Customer" : message.role === "staff" ? "Team" : "Assistant"} · {formatWhen(message.createdAt)}
                          {message.toolEvents?.some((event) => event.type === "grounding_failure") ? <Badge variant="warning">Fact check intervened</Badge> : null}
                        </p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </>
            ) : (
              <CardContent className="p-8 text-center text-sm text-muted-foreground sm:p-10">Select a conversation to read the transcript.</CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

import type { AssistantCatalog } from "../domain/catalog";
import type { AssistantRepository, LeadHandoff } from "../domain/ports";
import {
  MAX_CUSTOMER_MESSAGE_CHARS,
  emptyContext,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantSettings,
  type ConversationChannel,
  type ItemFacts,
  type ProductCard,
  type TurnEvent,
  type TurnResult,
} from "../domain/types";
import { LlmError, type LlmClient, type LlmMessage, type LlmToolResultBlock } from "../llm/llm-client";
import { SAFE_FALLBACK_REPLY, checkGrounding } from "./grounding-guard";
import { buildBusinessFactsText, buildSystemPrompt } from "./system-prompt";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "./tools";

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 5;
const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_TOKENS = 700;
const MAX_CARDS = 3;

export const LLM_UNAVAILABLE_REPLY =
  "Sorry — I'm having trouble on my side right now. Could I take your name and phone number so the team can get back to you?";

export type EngineDeps = {
  llm: LlmClient;
  catalog: AssistantCatalog;
  repository: AssistantRepository;
  handoff: LeadHandoff;
  settings: AssistantSettings;
  businessName: string;
};

export type TurnInput = {
  channel: ConversationChannel;
  customerKey: string;
  /** Existing conversation id (web/simulator clients hold this). Ignored if it doesn't belong to this business/channel/customer. */
  conversationId?: string | null;
  text: string;
  /** Channel message id for idempotency (WhatsApp wamid). */
  externalId?: string | null;
  customerName?: string | null;
};

function toLlmHistory(messages: AssistantMessage[]): LlmMessage[] {
  const history: LlmMessage[] = [];
  for (const message of messages) {
    const role = message.role === "customer" ? "user" : "assistant";
    const content = message.role === "staff" ? `(Message from a team member) ${message.content}` : message.content;
    const last = history[history.length - 1];
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${content}`;
    } else {
      history.push({ role, content });
    }
  }
  while (history.length > 0 && history[0].role !== "user") history.shift();
  return history;
}

function textOf(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text as string)
    .join("\n")
    .trim();
}

function toCard(item: ItemFacts): ProductCard {
  return {
    id: item.id,
    name: item.name,
    priceLabel: item.priceLabel,
    status: item.status,
    imageUrl: item.imageUrl,
    dimensions: item.dimensions,
    material: item.material,
    color: item.color,
  };
}

/**
 * Mission 033 — the channel-agnostic conversation engine. One customer
 * message in, one grounded reply (or deliberate silence) out. Website
 * chat, WhatsApp and the demo simulator all call this; they differ only
 * in how text arrives and leaves.
 */
export class AssistantEngine {
  constructor(private readonly deps: EngineDeps) {}

  async handleTurn(input: TurnInput): Promise<TurnResult> {
    const { repository } = this.deps;
    const text = input.text.trim().slice(0, MAX_CUSTOMER_MESSAGE_CHARS);
    const events: TurnEvent[] = [];

    // Idempotency: a retried webhook delivery is acknowledged, never answered twice.
    if (input.externalId && (await repository.hasExternalId(input.externalId))) {
      return { conversationId: input.conversationId ?? "", state: "bot", reply: null, products: [], leadId: null, duplicate: true, events };
    }

    const conversation = await this.resolveConversation(input);
    const stored = await repository.appendMessage({
      conversationId: conversation.id,
      role: "customer",
      content: text,
      externalId: input.externalId ?? null,
    });
    if (!stored) {
      // Lost an idempotency race with a concurrent delivery of the same message.
      return { conversationId: conversation.id, state: conversation.state, reply: null, products: [], leadId: conversation.leadId, duplicate: true, events };
    }

    if (conversation.state === "human") {
      // Human takeover: record the customer's message, say nothing.
      events.push({ type: "silent_human_mode" });
      await repository.updateConversation(conversation.id, {});
      return { conversationId: conversation.id, state: "human", reply: null, products: [], leadId: conversation.leadId, duplicate: false, events };
    }
    if (conversation.state === "closed") {
      conversation.state = "bot";
      await repository.updateConversation(conversation.id, { state: "bot" });
    }

    const recentMessages = await repository.listMessages(conversation.id, HISTORY_LIMIT);
    const history = toLlmHistory(recentMessages);
    const recentCustomerMessages = recentMessages.filter((message) => message.role === "customer").map((message) => message.content);

    const toolCtx: ToolContext = {
      catalog: this.deps.catalog,
      handoff: this.deps.handoff,
      conversation,
      context: conversation.context,
      events,
      retrievedThisTurn: new Map(),
      recentCustomerMessages,
      requestedHuman: { value: false },
    };

    let reply: string;
    try {
      reply = await this.produceGroundedReply(history, toolCtx, text);
    } catch (error) {
      const code = error instanceof LlmError ? error.code : "UNAVAILABLE";
      events.push({ type: "llm_error", code });
      reply = LLM_UNAVAILABLE_REPLY;
    }

    if (toolCtx.requestedHuman.value) {
      conversation.state = "human";
      events.push({ type: "handoff_to_human" });
    }

    const cards = [...toolCtx.retrievedThisTurn.values()]
      .filter((item) => reply.toLowerCase().includes(item.name.toLowerCase()))
      .slice(0, MAX_CARDS)
      .map(toCard);

    await repository.appendMessage({ conversationId: conversation.id, role: "assistant", content: reply, toolEvents: events });
    await repository.updateConversation(conversation.id, {
      state: conversation.state,
      customerName: conversation.customerName,
      context: conversation.context,
      leadId: conversation.leadId,
    });

    return {
      conversationId: conversation.id,
      state: conversation.state,
      reply,
      products: cards,
      leadId: conversation.leadId,
      duplicate: false,
      events,
    };
  }

  private async resolveConversation(input: TurnInput): Promise<AssistantConversation> {
    const { repository } = this.deps;
    if (input.conversationId) {
      const existing = await repository.getConversation(input.conversationId);
      if (existing && existing.channel === input.channel && existing.customerKey === input.customerKey) return existing;
    }
    const active = await repository.findActiveConversation(input.channel, input.customerKey);
    if (active) return active;
    const created = await repository.createConversation({
      channel: input.channel,
      customerKey: input.customerKey,
      customerName: input.customerName ?? null,
    });
    if (!created.context) created.context = emptyContext();
    return created;
  }

  private async produceGroundedReply(history: LlmMessage[], ctx: ToolContext, customerText: string): Promise<string> {
    const { settings, businessName, catalog } = this.deps;
    const system = buildSystemPrompt({
      settings,
      businessName,
      itemNounPlural: catalog.itemNounPlural,
      channel: ctx.conversation.channel,
      context: ctx.context,
    });
    const businessFactsText = buildBusinessFactsText(settings, businessName);
    const allCustomerText = ctx.recentCustomerMessages.join("\n") || customerText;

    const check = (reply: string) =>
      checkGrounding(reply, {
        items: Object.values(ctx.context.items),
        customerText: allCustomerText,
        businessFactsText,
      });

    let messages: LlmMessage[] = [...history];
    let draft = await this.runModelLoop(system, messages, ctx);
    let result = check(draft.text);
    if (result.ok) return draft.text;

    ctx.events.push({ type: "grounding_failure", violations: result.violations });
    // One correction attempt: show the model exactly what was ungrounded.
    messages = [
      ...draft.messages,
      {
        role: "user",
        content:
          `SYSTEM CORRECTION (not from the customer): your last reply contained claims not supported by tool results:\n- ${result.violations.join("\n- ")}\n` +
          "Rewrite the reply using ONLY facts returned by tools in this conversation (call get_item or search_inventory again if needed). Do not mention this correction.",
      },
    ];
    draft = await this.runModelLoop(system, messages, ctx);
    result = check(draft.text);
    if (result.ok) return draft.text;

    ctx.events.push({ type: "grounding_failure", violations: result.violations });
    return SAFE_FALLBACK_REPLY;
  }

  /** Runs the model until it stops calling tools (bounded), returning its final text and the full message trail. */
  private async runModelLoop(system: string, startMessages: LlmMessage[], ctx: ToolContext): Promise<{ text: string; messages: LlmMessage[] }> {
    const messages: LlmMessage[] = [...startMessages];
    let toolCalls = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await this.deps.llm.complete({ system, messages, tools: TOOL_DEFINITIONS, maxTokens: MAX_TOKENS });
      const toolUses = response.content.filter((block) => block.type === "tool_use");
      if (toolUses.length === 0) {
        const text = textOf(response.content);
        messages.push({ role: "assistant", content: text || "…" });
        return { text: text || SAFE_FALLBACK_REPLY, messages };
      }

      messages.push({ role: "assistant", content: response.content });
      const results: LlmToolResultBlock[] = [];
      for (const use of toolUses) {
        if (use.type !== "tool_use") continue;
        toolCalls += 1;
        if (toolCalls > MAX_TOOL_CALLS_PER_TURN) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ error: "Tool call limit reached for this message." }), is_error: true });
          continue;
        }
        const outcome = await executeTool(use.name, use.input, ctx);
        ctx.events.push({ type: "tool_call", name: use.name, ok: outcome.ok });
        results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.output, is_error: !outcome.ok });
      }
      messages.push({ role: "user", content: results });
    }

    // Tool budget exhausted: ask for a final answer with no tools available.
    const final = await this.deps.llm.complete({ system, messages, tools: [], maxTokens: MAX_TOKENS });
    const text = textOf(final.content);
    messages.push({ role: "assistant", content: text || "…" });
    return { text: text || SAFE_FALLBACK_REPLY, messages };
  }
}

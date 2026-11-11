import { UPGRADE_CONTACT_COPY } from "@/features/entitlements/domain/plan";
import type { EntitlementService } from "@/features/entitlements/service/entitlement-service";
import { EVEREST_NAME } from "../domain/brand";
import type { InventoryAdapter } from "../domain/inventory-types";
import { buildSystemPrompt } from "../domain/prompt";
import {
  CONTEXT_MESSAGE_LIMIT,
  MAX_CONTEXT_CHARS_PER_MESSAGE,
  MAX_INPUT_CHARS,
  MAX_REPLY_TOKENS,
  MAX_TOOL_ITERATIONS,
  PENDING_ACTION_TTL_MINUTES,
  RATE_LIMIT_MESSAGES_PER_MINUTE,
} from "../domain/thresholds";
import { addMinutes, monthStartNairobi, nextMonthStartNairobi } from "../domain/time";
import { buildToolDefinitions } from "../domain/tools";
import {
  fail,
  isReadToolName,
  isWriteToolName,
  ok,
  type Actor,
  type EverestResult,
  type ChatMessage,
  type Conversation,
  type PendingAction,
} from "../domain/types";
import { LlmUnavailableError, type LlmClient, type LlmContentBlock, type LlmMessage } from "../llm/llm-client";
import type { EverestRepository } from "../repository/everest-repository";
import { ToolRunner } from "./tool-runner";

export type EntitlementPort = Pick<EntitlementService, "canAccess" | "resolveLimitGate">;

export type ConversationState = {
  conversation: Conversation | null;
  messages: ChatMessage[];
  pendingActions: PendingAction[];
};

export type EverestOverview = {
  configured: boolean;
  access: { allowed: true } | { allowed: false; message: string };
  usage: { used: number; limit: number | null; resetsAt: string };
  state: ConversationState;
};

export type EverestDeps = {
  businessId: string;
  businessName: string;
  repository: EverestRepository;
  adapter: InventoryAdapter;
  /** null when no model is configured (no ANTHROPIC_API_KEY). */
  llm: LlmClient | null;
  entitlements: EntitlementPort;
};

const DISPLAY_MESSAGE_LIMIT = 60;

/**
 * Everest. The only place the model, the tool runner, the entitlement
 * gates and the persistence meet. Safety properties enforced *here*, in
 * code, regardless of what the model says:
 *  - write tools only ever create a pending action (never execute);
 *  - execution happens only in `confirmPendingAction`, claimed by one
 *    conditional UPDATE, with permission and entitlement re-checked;
 *  - the monthly allowance and per-minute rate are checked and the
 *    message recorded in a single transaction;
 *  - tool data reaches the model escaped, never as raw markup.
 * `now` is always a parameter.
 */
export class EverestService {
  constructor(private readonly deps: EverestDeps) {}

  // ------------------------------------------------------------------ access

  private async checkAccess(now: Date): Promise<{ allowed: true } | { allowed: false; message: string }> {
    const decision = await this.deps.entitlements.canAccess(this.deps.businessId, "everest", now);
    if (decision.allowed) return { allowed: true };
    if (decision.reason === "PLAN_DOES_NOT_INCLUDE_CAPABILITY") {
      return { allowed: false, message: `${EVEREST_NAME} is part of the Pro plan and the free trial. ${UPGRADE_CONTACT_COPY}` };
    }
    return { allowed: false, message: `Your subscription isn't active, so ${EVEREST_NAME} is unavailable right now.` };
  }

  private runner(actor: Actor): ToolRunner {
    return new ToolRunner(this.deps.adapter, actor, async () => {
      const gate = await this.deps.entitlements.resolveLimitGate(this.deps.businessId, this.deps.adapter.limitKey);
      if (!gate.ok) return { ok: false, message: "Your subscription isn't active, so new items can't be added." };
      return { ok: true, limit: gate.limit };
    });
  }

  // ---------------------------------------------------------------- overview

  async getOverview(actor: Actor, conversationId: string | null, now: Date): Promise<EverestOverview> {
    const access = await this.checkAccess(now);
    const gate = await this.deps.entitlements.resolveLimitGate(this.deps.businessId, "everest_messages", now);
    const used = await this.deps.repository.countUserMessagesSince(monthStartNairobi(now).toISOString());
    const state = await this.getState(actor, conversationId, now);
    return {
      configured: this.deps.llm !== null,
      access,
      usage: { used, limit: gate.ok ? gate.limit : null, resetsAt: nextMonthStartNairobi(now).toISOString() },
      state,
    };
  }

  /** The conversation (the one asked for, or the user's most recent) with its messages and proposals. */
  async getState(actor: Actor, conversationId: string | null, now: Date): Promise<ConversationState> {
    const conversation = conversationId
      ? await this.deps.repository.getConversation(actor.userId, conversationId)
      : await this.deps.repository.getLatestConversation(actor.userId);
    if (!conversation) return { conversation: null, messages: [], pendingActions: [] };
    await this.deps.repository.expireStalePendingActions(conversation.id, now.toISOString());
    const [messages, pendingActions] = await Promise.all([
      this.deps.repository.listMessages(conversation.id, DISPLAY_MESSAGE_LIMIT),
      this.deps.repository.listPendingActions(conversation.id),
    ]);
    return { conversation, messages, pendingActions };
  }

  // -------------------------------------------------------------------- send

  async sendMessage(actor: Actor, conversationId: string | null, rawText: string, now: Date): Promise<EverestResult<ConversationState>> {
    const text = rawText.trim();
    if (text === "") return fail("INVALID_INPUT", "Type a message first.");
    if (text.length > MAX_INPUT_CHARS) return fail("INVALID_INPUT", `That message is too long (limit ${MAX_INPUT_CHARS} characters).`);

    // Not configured is checked before anything is counted or stored: a missing key never costs a message.
    const llm = this.deps.llm;
    if (!llm) return fail("NOT_CONFIGURED", `${EVEREST_NAME} isn't set up yet — the AI service key is missing.`);

    const access = await this.checkAccess(now);
    if (!access.allowed) return fail("FORBIDDEN", access.message);

    const gate = await this.deps.entitlements.resolveLimitGate(this.deps.businessId, "everest_messages", now);
    if (!gate.ok) return fail("FORBIDDEN", `Your subscription isn't active, so ${EVEREST_NAME} is unavailable right now.`);

    let conversation: Conversation | null = null;
    if (conversationId) {
      conversation = await this.deps.repository.getConversation(actor.userId, conversationId);
      if (!conversation) return fail("NOT_FOUND", "That conversation was not found.");
    } else {
      conversation = await this.deps.repository.createConversation(actor.userId, titleFrom(text), now.toISOString());
    }

    const recorded = await this.deps.repository.recordUserMessageWithinLimits({
      userId: actor.userId,
      conversationId: conversation.id,
      content: text,
      now: now.toISOString(),
      monthStart: monthStartNairobi(now).toISOString(),
      monthlyLimit: gate.limit,
      rateWindowStart: new Date(now.getTime() - 60 * 1000).toISOString(),
      rateLimit: RATE_LIMIT_MESSAGES_PER_MINUTE,
    });
    if (!recorded.recorded) {
      if (recorded.reason === "LIMIT_REACHED") {
        const resets = nextMonthStartNairobi(now).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Nairobi" });
        return fail("LIMIT_REACHED", `You've used all ${gate.limit} ${EVEREST_NAME} messages for this month. They reset on ${resets}.`);
      }
      return fail("RATE_LIMITED", "You're sending messages very quickly. Wait a few seconds and try again.");
    }

    const history = await this.deps.repository.listMessages(conversation.id, CONTEXT_MESSAGE_LIMIT);
    const messages = toLlmHistory(history);
    const tools = buildToolDefinitions(this.deps.adapter);
    const system = buildSystemPrompt({ businessName: this.deps.businessName, adapter: this.deps.adapter, now });
    const runner = this.runner(actor);
    const proposedIds: string[] = [];
    let finalText = "";

    try {
      for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
        const response = await llm.complete({ system, messages, tools, maxTokens: MAX_REPLY_TOKENS });
        const toolUses = response.content.filter((block) => block.type === "tool_use");
        const texts = response.content.flatMap((block) => (block.type === "text" ? [block.text] : []));

        if (response.stopReason !== "tool_use" || toolUses.length === 0) {
          finalText = texts.join("\n").trim();
          break;
        }

        messages.push({ role: "assistant", content: response.content });
        const results: LlmContentBlock[] = [];
        for (const block of toolUses) {
          if (block.type !== "tool_use") continue;
          const input = block.input;
          if (isReadToolName(block.name)) {
            const result = await runner.runRead(block.name, input);
            results.push({ type: "tool_result", tool_use_id: block.id, content: result.content, ...(result.isError ? { is_error: true } : {}) });
          } else if (isWriteToolName(block.name)) {
            const proposal = await runner.propose(block.name, input);
            if (!proposal.ok) {
              results.push({ type: "tool_result", tool_use_id: block.id, content: proposal.message, is_error: true });
            } else {
              const pending = await this.deps.repository.createPendingAction({
                conversationId: conversation.id,
                userId: actor.userId,
                toolName: proposal.toolName,
                args: proposal.args,
                summary: proposal.summary,
                changes: proposal.changes,
                createdAt: now.toISOString(),
                expiresAt: addMinutes(now, PENDING_ACTION_TTL_MINUTES).toISOString(),
              });
              proposedIds.push(pending.id);
              results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Proposed and waiting for the person to confirm — NOT done yet: ${proposal.summary}. Tell them to review the card and press Confirm.`,
              });
            }
          } else {
            results.push({ type: "tool_result", tool_use_id: block.id, content: "Unknown tool.", is_error: true });
          }
        }
        messages.push({ role: "user", content: results });
      }
    } catch (error) {
      if (error instanceof LlmUnavailableError) return fail("LLM_UNAVAILABLE", error.message);
      console.error("Everest turn failed", error);
      return fail("INTERNAL", `${EVEREST_NAME} hit a problem. Please try again.`);
    }

    if (finalText === "") {
      finalText =
        proposedIds.length > 0
          ? "I've prepared the change below. Please review it and press Confirm if it looks right."
          : "I couldn't finish that. Could you try again, perhaps in smaller steps?";
    }

    const assistantMessage = await this.deps.repository.addEverestMessage(actor.userId, conversation.id, finalText, now.toISOString());
    await this.deps.repository.attachPendingActionsToMessage(proposedIds, assistantMessage.id);
    await this.deps.repository.touchConversation(conversation.id, now.toISOString());
    return ok(await this.getState(actor, conversation.id, now));
  }

  // ------------------------------------------------------ confirm / cancel

  async confirmPendingAction(actor: Actor, pendingId: string, now: Date): Promise<EverestResult<ConversationState>> {
    const access = await this.checkAccess(now);
    if (!access.allowed) return fail("FORBIDDEN", access.message);

    const pending = await this.deps.repository.getPendingAction(actor.userId, pendingId);
    if (!pending) return fail("NOT_FOUND", "That proposed change was not found.");

    const runner = this.runner(actor);
    // Permission is re-checked now, against the person pressing Confirm — a staff member cannot confirm a delete however it got proposed.
    if (!runner.canRun(pending.toolName)) {
      return fail("FORBIDDEN", `Only the business owner can delete ${this.deps.adapter.itemNounPlural}.`);
    }

    const claimed = await this.deps.repository.claimPendingAction(actor.userId, pendingId, now.toISOString());
    if (!claimed) {
      const current = await this.deps.repository.getPendingAction(actor.userId, pendingId);
      if (current && current.status === "pending") {
        await this.deps.repository.markExpired(pendingId, now.toISOString());
        return fail("ACTION_EXPIRED", "That proposed change has expired. Ask again and I'll prepare it afresh.");
      }
      if (current && current.status === "expired") return fail("ACTION_EXPIRED", "That proposed change has expired. Ask again and I'll prepare it afresh.");
      return fail("ACTION_NOT_PENDING", "That change was already handled.");
    }

    let report;
    try {
      report = await runner.execute(pending.toolName, pending.args);
    } catch (error) {
      console.error("Everest action failed", error);
      report = { ok: false, outcome: "failed" as const, message: "Something went wrong and the change was not completed.", before: [] };
    }

    await this.deps.repository.recordPendingResult(pendingId, report.ok, report.message);
    await this.deps.repository.addAuditEntry({
      userId: actor.userId,
      pendingActionId: pendingId,
      toolName: pending.toolName,
      args: pending.args,
      before: report.before,
      outcome: report.outcome,
      detail: report.message,
      createdAt: now.toISOString(),
    });
    await this.deps.repository.addEverestMessage(
      actor.userId,
      pending.conversationId,
      report.ok ? `Done. ${report.message}` : `That didn't fully go through. ${report.message}`,
      now.toISOString()
    );
    await this.deps.repository.touchConversation(pending.conversationId, now.toISOString());
    return ok(await this.getState(actor, pending.conversationId, now));
  }

  async cancelPendingAction(actor: Actor, pendingId: string, now: Date): Promise<EverestResult<ConversationState>> {
    const pending = await this.deps.repository.getPendingAction(actor.userId, pendingId);
    if (!pending) return fail("NOT_FOUND", "That proposed change was not found.");
    const cancelled = await this.deps.repository.cancelPendingAction(actor.userId, pendingId, now.toISOString());
    if (!cancelled) return fail("ACTION_NOT_PENDING", "That change was already handled.");
    return ok(await this.getState(actor, pending.conversationId, now));
  }
}

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length <= 40 ? oneLine : `${oneLine.slice(0, 39)}…`;
}

/** Plain text turns only (never tool traces), capped per turn, always starting with a user turn. */
function toLlmHistory(history: ChatMessage[]): LlmMessage[] {
  const turns: LlmMessage[] = history.map((message) => ({
    role: message.role,
    content: message.content.length > MAX_CONTEXT_CHARS_PER_MESSAGE ? `${message.content.slice(0, MAX_CONTEXT_CHARS_PER_MESSAGE)}…` : message.content,
  }));
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();
  return turns;
}

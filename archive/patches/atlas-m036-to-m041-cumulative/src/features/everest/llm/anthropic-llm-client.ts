import { reserveGlobalAiCall } from "@/lib/ai/spend-guard";
import { LLM_TIMEOUT_SECONDS } from "../domain/thresholds";
import { LlmUnavailableError, type LlmClient, type LlmRequest, type LlmResponse } from "./llm-client";

/**
 * Default model: the same one the M031 content generator uses, so a
 * deployment needs only the existing ANTHROPIC_API_KEY. Override with
 * ASSISTANT_MODEL (a stronger model usually follows multi-step
 * inventory instructions better; it also costs more per message).
 */
export const DEFAULT_ASSISTANT_MODEL = "claude-haiku-4-5-20251001";

const API_URL = "https://api.anthropic.com/v1/messages";

type RawBlock = { type?: unknown; text?: unknown; id?: unknown; name?: unknown; input?: unknown };

/** Thin fetch client for Anthropic's Messages API with tool use. No SDK, consistent with M031. */
export class AnthropicLlmClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_ASSISTANT_MODEL
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    // Mission 037 — global daily cap on outbound Anthropic calls (fail closed).
    if (!(await reserveGlobalAiCall())) throw new LlmUnavailableError();
    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
          tools: request.tools,
        }),
        signal: AbortSignal.timeout(LLM_TIMEOUT_SECONDS * 1000),
      });
    } catch {
      throw new LlmUnavailableError();
    }

    if (!response.ok) {
      // Never surface the provider's raw error body (it can contain internal detail); status is enough to act on in logs.
      console.error(`Everest model request failed with status ${response.status}`);
      throw new LlmUnavailableError();
    }

    let body: { content?: unknown; stop_reason?: unknown };
    try {
      body = (await response.json()) as { content?: unknown; stop_reason?: unknown };
    } catch {
      throw new LlmUnavailableError();
    }

    const blocks: LlmResponse["content"] = [];
    for (const raw of Array.isArray(body.content) ? (body.content as RawBlock[]) : []) {
      if (raw.type === "text" && typeof raw.text === "string") {
        blocks.push({ type: "text", text: raw.text });
      } else if (raw.type === "tool_use" && typeof raw.id === "string" && typeof raw.name === "string") {
        const input = raw.input && typeof raw.input === "object" && !Array.isArray(raw.input) ? (raw.input as Record<string, unknown>) : {};
        blocks.push({ type: "tool_use", id: raw.id, name: raw.name, input });
      }
    }

    const stop = body.stop_reason;
    const stopReason: LlmResponse["stopReason"] =
      stop === "end_turn" || stop === "tool_use" || stop === "max_tokens" ? stop : "other";
    return { content: blocks, stopReason };
  }
}

/** Returns a client when ANTHROPIC_API_KEY is set, otherwise null — the UI then shows an honest "not configured" state. */
export function createEverestLlmClient(): LlmClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new AnthropicLlmClient(apiKey, process.env.ASSISTANT_MODEL || DEFAULT_ASSISTANT_MODEL);
}

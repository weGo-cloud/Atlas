import type { ToolDefinition } from "../domain/tools";

export type LlmTextBlock = { type: "text"; text: string };
export type LlmToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type LlmToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock;

export type LlmMessage = { role: "user" | "assistant"; content: string | LlmContentBlock[] };

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
};

export type LlmResponse = {
  content: Array<LlmTextBlock | LlmToolUseBlock>;
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
};

/** Thrown for any failure reaching or reading the model. The message is safe to show; raw provider bodies are never exposed. */
export class LlmUnavailableError extends Error {
  constructor(message = "The assistant could not reach its AI service. Please try again in a moment.") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/**
 * The seam between Everest and a language model. The service only ever
 * talks to this interface, so tests drive it with a scripted fake and
 * the real thing is a thin HTTP client (anthropic-llm-client.ts).
 */
export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

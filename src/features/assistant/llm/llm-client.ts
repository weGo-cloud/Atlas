/**
 * Mission 033 — the assistant's model boundary. The engine depends on
 * this interface only; AnthropicLlmClient is the real implementation
 * and tests use a scripted fake. There is deliberately no "mock AI"
 * implementation for production use: without an API key the assistant
 * is simply unavailable (see getLlmClient).
 */
export type LlmTextBlock = { type: "text"; text: string };
export type LlmToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type LlmToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type LlmMessage =
  | { role: "user"; content: string | Array<LlmTextBlock | LlmToolResultBlock> }
  | { role: "assistant"; content: string | Array<LlmTextBlock | LlmToolUseBlock> };

export type LlmToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type LlmResponse = {
  content: Array<LlmTextBlock | LlmToolUseBlock>;
  stopReason: string;
};

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  maxTokens: number;
};

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export type LlmErrorCode = "NOT_CONFIGURED" | "UNAVAILABLE" | "BAD_RESPONSE";

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: LlmErrorCode
  ) {
    super(message);
    this.name = "LlmError";
  }
}

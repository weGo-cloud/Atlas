import {
  LlmError,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
  type LlmTextBlock,
  type LlmToolUseBlock,
} from "./llm-client";

export const DEFAULT_ASSISTANT_MODEL = "claude-sonnet-5";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Real integration with api.anthropic.com/v1/messages (tool use). Like
 * AnthropicContentGenerator it fails honestly and never forwards the
 * provider's raw response body to a caller.
 */
export class AnthropicLlmClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_ASSISTANT_MODEL
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
          ...(request.tools.length > 0 ? { tools: request.tools } : {}),
        }),
      });
    } catch {
      throw new LlmError("Could not reach the AI service.", "UNAVAILABLE");
    }

    if (!response.ok) {
      throw new LlmError(
        response.status === 401 || response.status === 403
          ? "The AI service is not properly configured."
          : "The AI service is temporarily unavailable.",
        response.status === 401 || response.status === 403 ? "NOT_CONFIGURED" : "UNAVAILABLE"
      );
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason?: string;
    };
    if (!Array.isArray(payload.content)) {
      throw new LlmError("The AI service returned an unexpected response.", "BAD_RESPONSE");
    }

    const content: Array<LlmTextBlock | LlmToolUseBlock> = [];
    for (const block of payload.content) {
      if (block.type === "text" && typeof block.text === "string") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use" && block.id && block.name) {
        content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input ?? {} });
      }
    }
    return { content, stopReason: payload.stop_reason ?? "end_turn" };
  }
}

/** Null when no API key is configured — the caller must then treat the assistant as unavailable, never substitute canned replies. */
export function getLlmClient(): LlmClient | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new AnthropicLlmClient(key, process.env.ASSISTANT_MODEL || DEFAULT_ASSISTANT_MODEL);
}

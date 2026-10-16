import { LLM_TIMEOUT_SECONDS } from "../domain/thresholds";
import type { ToolDefinition } from "../domain/tools";
import { LlmUnavailableError, type LlmClient, type LlmMessage, type LlmRequest, type LlmResponse } from "./llm-client";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toGeminiSchema(schema: JsonObject): JsonObject {
  const result: JsonObject = {};
  if (typeof schema.type === "string") result.type = schema.type.toUpperCase();
  if (typeof schema.description === "string") result.description = schema.description;
  if (Array.isArray(schema.enum)) result.enum = schema.enum;
  if (Array.isArray(schema.required)) result.required = schema.required;
  if (isObject(schema.properties)) {
    const properties: JsonObject = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (isObject(value)) properties[key] = toGeminiSchema(value);
    }
    result.properties = properties;
  }
  if (isObject(schema.items)) result.items = toGeminiSchema(schema.items);
  return result;
}

function toGeminiTools(tools: ToolDefinition[]): JsonObject[] {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: toGeminiSchema(tool.input_schema),
      })),
    },
  ];
}

function toGeminiContents(messages: LlmMessage[]): JsonObject[] {
  const functionNames = new Map<string, string>();
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return {
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      };
    }

    const parts: JsonObject[] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        parts.push({ text: block.text });
      } else if (block.type === "tool_use") {
        functionNames.set(block.id, block.name);
        parts.push({ functionCall: { id: block.id, name: block.name, args: block.input } });
      } else if (block.type === "tool_result") {
        const name = functionNames.get(block.tool_use_id);
        if (!name) throw new LlmUnavailableError();
        parts.push({
          functionResponse: {
            id: block.tool_use_id,
            name,
            response: block.is_error ? { error: block.content } : { result: block.content },
          },
        });
      }
    }
    return { role: message.role === "assistant" ? "model" : "user", parts };
  });
}

/** Thin fetch client for Gemini's generateContent API with function calling. */
export class GeminiLlmClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_GEMINI_MODEL
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: toGeminiContents(request.messages),
          tools: toGeminiTools(request.tools),
          generationConfig: { maxOutputTokens: request.maxTokens },
        }),
        signal: AbortSignal.timeout(LLM_TIMEOUT_SECONDS * 1000),
      });
    } catch (error) {
      if (error instanceof LlmUnavailableError) throw error;
      throw new LlmUnavailableError();
    }

    if (!response.ok) {
      console.error(`Gemini model request failed with status ${response.status}`);
      throw new LlmUnavailableError();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new LlmUnavailableError();
    }

    const candidate = isObject(body) && Array.isArray(body.candidates) ? body.candidates[0] : undefined;
    const content = isObject(candidate) && isObject(candidate.content) ? candidate.content : undefined;
    const rawParts = content && Array.isArray(content.parts) ? content.parts : [];
    const blocks: LlmResponse["content"] = [];
    rawParts.forEach((raw: unknown, index: number) => {
      if (!isObject(raw)) return;
      if (typeof raw.text === "string") {
        blocks.push({ type: "text", text: raw.text });
      } else if (isObject(raw.functionCall)) {
        const call = raw.functionCall;
        if (typeof call.name !== "string") return;
        const input = isObject(call.args) ? call.args : {};
        const id = typeof call.id === "string" && call.id.length > 0 ? call.id : `gemini_call_${index}`;
        blocks.push({ type: "tool_use", id, name: call.name, input });
      }
    });

    const finishReason = isObject(candidate) ? candidate.finishReason : undefined;
    const hasToolUse = blocks.some((block) => block.type === "tool_use");
    const stopReason: LlmResponse["stopReason"] = hasToolUse
      ? "tool_use"
      : finishReason === "STOP"
        ? "end_turn"
        : finishReason === "MAX_TOKENS"
          ? "max_tokens"
          : "other";
    return { content: blocks, stopReason };
  }
}

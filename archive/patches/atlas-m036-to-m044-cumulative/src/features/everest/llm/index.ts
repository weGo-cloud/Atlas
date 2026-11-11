import type { LlmClient } from "./llm-client";
import { AnthropicLlmClient, DEFAULT_ASSISTANT_MODEL } from "./anthropic-llm-client";
import { DEFAULT_GEMINI_MODEL, GeminiLlmClient } from "./gemini-llm-client";

/**
 * Everest prefers Gemini when GEMINI_API_KEY is configured, and falls
 * back to Anthropic for existing deployments. Keys are sent only in
 * provider-specific headers, never included in request URLs.
 */
export function createAssistantLlmClient(): LlmClient | null {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    return new GeminiLlmClient(geminiApiKey, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicApiKey) {
    return new AnthropicLlmClient(anthropicApiKey, process.env.ASSISTANT_MODEL || DEFAULT_ASSISTANT_MODEL);
  }

  return null;
}

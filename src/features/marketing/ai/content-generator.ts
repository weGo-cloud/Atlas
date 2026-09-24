import type { GroundedFacts } from "../domain/grounded-facts";
import { buildFactsPromptBlock, buildTemplateBlurb } from "../domain/marketing-copy";
import type { GenerationMethod } from "../domain/marketing-content";

export type GeneratedBlurb = { method: GenerationMethod; blurb: string };

export interface ContentGenerator {
  generateBlurb(facts: GroundedFacts): Promise<GeneratedBlurb>;
}

export class AiGenerationError extends Error {}

const SYSTEM_PROMPT = `You write short marketing blurbs for a dealer's online listing (2-3 sentences, plain text, no markdown, no headings, no emoji spam).

Rules you must follow exactly:
- Use ONLY the facts provided below. Do not invent or assume anything not stated.
- Do NOT state the price, availability status, or restate exact attribute values verbatim — those are shown separately; write about the item's appeal instead.
- Do NOT mention specifications, warranties, financing, delivery, discounts, or reviews unless they appear explicitly in the facts.
- Do NOT make comparative or superlative claims ("the best", "unbeatable price") that aren't grounded in the given facts.
- If the provided facts are sparse, write a shorter, honest blurb rather than padding it with invented detail.
- Output only the blurb text itself, nothing else.`;

/**
 * Mission 031, Section 4/5 — a real integration: this calls
 * api.anthropic.com/v1/messages with whatever ANTHROPIC_API_KEY is
 * configured for the deployment. It is not wired to a mock response
 * anywhere in this class — if the request fails or the key is
 * missing, it fails honestly (AiGenerationError) rather than
 * returning invented copy. getContentGenerator() (below) is what
 * decides whether to use this class at all, falling back to
 * TemplateContentGenerator when no key is configured — so the
 * "IMPLEMENTED vs simulated" distinction lives at that boundary, not
 * inside a fake response here.
 */
export class AnthropicContentGenerator implements ContentGenerator {
  constructor(private readonly apiKey: string, private readonly model = "claude-haiku-4-5-20251001") {}

  async generateBlurb(facts: GroundedFacts): Promise<GeneratedBlurb> {
    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 200,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildFactsPromptBlock(facts) }],
        }),
      });
    } catch {
      throw new AiGenerationError("Could not reach the AI content service. Please try again.");
    }

    if (!response.ok) {
      // Deliberately not forwarding the raw provider response body to
      // the caller — it can include request/account detail that isn't
      // safe to surface to a dealer-facing error message.
      throw new AiGenerationError(
        response.status === 401 || response.status === 403
          ? "AI content generation is not properly configured for this environment."
          : "AI content generation is temporarily unavailable. Please try again."
      );
    }

    const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const textBlock = payload.content?.find((block) => block.type === "text" && block.text);
    if (!textBlock?.text) {
      throw new AiGenerationError("AI content generation returned an unexpected response.");
    }

    return { method: "ai", blurb: textBlock.text.trim() };
  }
}

/** Mission 031, Section 17 — the honest non-AI path, used whenever no API key is configured. Never presented as AI-written; MarketingContent.generationMethod records which one actually ran. */
export class TemplateContentGenerator implements ContentGenerator {
  async generateBlurb(facts: GroundedFacts): Promise<GeneratedBlurb> {
    return { method: "template", blurb: buildTemplateBlurb(facts) };
  }
}

export function getContentGenerator(): ContentGenerator {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) return new AnthropicContentGenerator(apiKey);
  return new TemplateContentGenerator();
}

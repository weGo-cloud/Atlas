import type { GroundedFacts } from "./grounded-facts";

/**
 * Mission 031, Section 6 — the structural half of the grounding
 * guarantee (the other half is the prompt instruction in
 * ai/content-generator.ts). A generator (AI or template) is only ever
 * asked to write a short, factual *blurb* — it never states the price
 * or availability itself. This module deterministically renders those
 * fields and stitches everything together, so a hallucinated number
 * in the blurb can't end up looking like an official price/spec line.
 */
export function buildFactsPromptBlock(facts: GroundedFacts): string {
  const lines = [
    `Item: ${facts.itemLabel}`,
    `Price: ${facts.priceLabel}`,
    `Availability: ${facts.availabilityLabel}`,
  ];
  if (facts.category) lines.push(`Category: ${facts.category}`);
  if (facts.condition) lines.push(`Condition: ${facts.condition}`);
  for (const [key, value] of Object.entries(facts.attributes)) {
    lines.push(`${key}: ${value}`);
  }
  if (facts.description.trim()) {
    lines.push(`Dealer's description: ${facts.description.trim()}`);
  }
  return lines.join("\n");
}

export function assembleSocialCaption(facts: GroundedFacts, blurb: string): string {
  const parts = [facts.itemLabel, blurb.trim(), `Price: ${facts.priceLabel}`, `Status: ${facts.availabilityLabel}`];
  return parts.filter(Boolean).join("\n\n");
}

export function assembleWhatsAppMessage(facts: GroundedFacts, blurb: string): string {
  const parts = [
    `Hi! Following up on the *${facts.itemLabel}*.`,
    blurb.trim(),
    `Price: ${facts.priceLabel} · ${facts.availabilityLabel}`,
    "Let us know if you'd like more details or to arrange a viewing.",
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * A deterministic, non-AI fallback blurb — used when no AI provider
 * is configured (Section 17: the AI path itself is never silently
 * simulated as if a model ran). Built only from `attributes` and the
 * dealer's own `description`, so it carries the same grounding
 * guarantee as the AI path, just without any generated prose.
 */
export function buildTemplateBlurb(facts: GroundedFacts): string {
  const attributeLine = Object.entries(facts.attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");

  const descriptionSentence = facts.description.trim();

  return [attributeLine, descriptionSentence].filter(Boolean).join(". ") || "Get in touch for more details.";
}

/**
 * Mission 031, Section 24 — "unsupported/fabricated fields are not
 * silently invented by application logic." A heuristic, defense-in-
 * depth check: every run of digits in a generated blurb must also
 * appear somewhere in the grounded facts (price, attributes,
 * description) — catching a model that states a made-up mileage,
 * discount percentage, or warranty year the dealer never provided.
 * Not a substitute for the prompt instruction (a fabricated *word*
 * claim like "comes with free delivery" has no digits to catch), but
 * a real, testable guard for the numeric-fact category Section 6
 * explicitly calls out.
 */
export function findUngroundedNumbers(blurb: string, facts: GroundedFacts): string[] {
  const groundedText = [facts.priceLabel, facts.availabilityLabel, facts.description, ...Object.values(facts.attributes)].join(
    " "
  );
  const groundedNumbers = new Set(groundedText.match(/\d+/g) ?? []);
  const blurbNumbers = blurb.match(/\d+/g) ?? [];
  return blurbNumbers.filter((n) => !groundedNumbers.has(n));
}

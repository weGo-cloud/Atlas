import type { GroundedFacts } from "../../marketing/domain/grounded-facts";
import type { PostTemplateId } from "./social-post";
import type { TemplateInput } from "./template-input";

const MAX_SPECS = 4;

/**
 * Mission 034 — the only place a TemplateInput is assembled, and it
 * reads exclusively from GroundedFacts (the M031 whitelist) plus a
 * resolved photo path supplied by the caller. Category/condition are
 * appended to `attributes` as extra spec rows rather than given their
 * own template slots, so this stays correct for any vertical's
 * attribute shape without per-vertical branching.
 */
export function buildTemplateInput(input: { templateId: PostTemplateId; facts: GroundedFacts; photoPath: string }): TemplateInput {
  const specs: Array<[string, string]> = [];
  if (input.facts.category) specs.push(["Category", input.facts.category]);
  if (input.facts.condition) specs.push(["Condition", input.facts.condition]);
  for (const [key, value] of Object.entries(input.facts.attributes)) {
    specs.push([key, value]);
  }

  return {
    templateId: input.templateId,
    itemLabel: input.facts.itemLabel,
    priceLabel: input.facts.priceLabel,
    availabilityLabel: input.facts.availabilityLabel,
    specs: specs.slice(0, MAX_SPECS),
    photoPath: input.photoPath,
  };
}

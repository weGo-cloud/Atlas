import { describe, expect, it } from "vitest";

import type { GroundedFacts } from "../grounded-facts";
import {
  assembleSocialCaption,
  assembleWhatsAppMessage,
  buildFactsPromptBlock,
  buildTemplateBlurb,
  findUngroundedNumbers,
} from "../marketing-copy";

function facts(overrides: Partial<GroundedFacts> = {}): GroundedFacts {
  return {
    itemLabel: "2021 Toyota Vitz",
    priceLabel: "KSh 1,800,000",
    availabilityLabel: "Available",
    category: null,
    condition: null,
    description: "Well maintained, single owner.",
    attributes: { Mileage: "45,000 km" },
    ...overrides,
  };
}

describe("buildFactsPromptBlock", () => {
  it("includes every grounded fact", () => {
    const block = buildFactsPromptBlock(facts());
    expect(block).toContain("2021 Toyota Vitz");
    expect(block).toContain("KSh 1,800,000");
    expect(block).toContain("Available");
    expect(block).toContain("Mileage: 45,000 km");
    expect(block).toContain("Well maintained, single owner.");
  });

  it("omits category/condition lines when null", () => {
    const block = buildFactsPromptBlock(facts({ category: null, condition: null }));
    expect(block).not.toContain("Category:");
    expect(block).not.toContain("Condition:");
  });

  it("includes category/condition when present", () => {
    const block = buildFactsPromptBlock(facts({ category: "Sofas", condition: "New" }));
    expect(block).toContain("Category: Sofas");
    expect(block).toContain("Condition: New");
  });
});

/** Mission 031, Section 6 — the price/availability are never left to the generator to phrase; they're deterministically appended after the blurb. */
describe("assembleSocialCaption / assembleWhatsAppMessage", () => {
  it("always includes the exact deterministic price and availability, regardless of blurb content", () => {
    const caption = assembleSocialCaption(facts(), "A reliable daily driver.");
    expect(caption).toContain("Price: KSh 1,800,000");
    expect(caption).toContain("Status: Available");
    expect(caption).toContain("A reliable daily driver.");
  });

  it("still appends the correct price even if the blurb tries to state a different one", () => {
    // The blurb is generator output — this proves the deterministic
    // footer isn't derived from or overridable by blurb content.
    const caption = assembleSocialCaption(facts(), "Now only KSh 999 — incredible deal!");
    expect(caption).toContain("Price: KSh 1,800,000");
  });

  it("whatsapp message includes the item label and a call to action", () => {
    const message = assembleWhatsAppMessage(facts(), "Great condition.");
    expect(message).toContain("2021 Toyota Vitz");
    expect(message).toMatch(/viewing|details/i);
  });
});

describe("buildTemplateBlurb", () => {
  it("only uses attributes and description — nothing invented", () => {
    const blurb = buildTemplateBlurb(facts());
    expect(blurb).toContain("Mileage: 45,000 km");
    expect(blurb).toContain("Well maintained, single owner.");
  });

  it("falls back to a generic line when there are no attributes or description", () => {
    const blurb = buildTemplateBlurb(facts({ attributes: {}, description: "" }));
    expect(blurb.length).toBeGreaterThan(0);
  });
});

/** Mission 031, Section 24 — "unsupported/fabricated fields are not silently invented." */
describe("findUngroundedNumbers", () => {
  it("finds no ungrounded numbers when the blurb only references given facts", () => {
    const result = findUngroundedNumbers("Only 45,000 km on the clock — priced at 1,800,000.", facts());
    expect(result).toEqual([]);
  });

  it("flags a number that appears nowhere in the grounded facts", () => {
    const result = findUngroundedNumbers("Comes with a 5 year warranty and 20% discount today.", facts());
    expect(result).toContain("5");
    expect(result).toContain("20");
  });

  it("does not flag numbers that are part of the price or availability text", () => {
    const result = findUngroundedNumbers("Priced at 1,800,000 and still available.", facts());
    expect(result).toEqual([]);
  });

  it("flags a fabricated mileage figure different from the real one", () => {
    const result = findUngroundedNumbers("Only 12,000 km on this one!", facts());
    expect(result.length).toBeGreaterThan(0);
  });
});

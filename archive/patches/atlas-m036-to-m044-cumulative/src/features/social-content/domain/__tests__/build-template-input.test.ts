import { describe, expect, it } from "vitest";

import type { GroundedFacts } from "../../../marketing/domain/grounded-facts";
import { buildTemplateInput } from "../build-template-input";

function facts(overrides: Partial<GroundedFacts> = {}): GroundedFacts {
  return {
    itemLabel: "2021 Toyota Vitz",
    priceLabel: "KSh 1,800,000",
    availabilityLabel: "Available",
    category: "Hatchback",
    condition: "Used",
    description: "Well maintained, single owner.",
    attributes: { Mileage: "45,000 km" },
    ...overrides,
  };
}

describe("buildTemplateInput", () => {
  it("carries item label/price/availability straight through, unchanged", () => {
    const input = buildTemplateInput({ templateId: "featured_item", facts: facts(), photoPath: "/tmp/x.png" });
    expect(input.itemLabel).toBe("2021 Toyota Vitz");
    expect(input.priceLabel).toBe("KSh 1,800,000");
    expect(input.availabilityLabel).toBe("Available");
    expect(input.photoPath).toBe("/tmp/x.png");
  });

  it("puts category and condition first, then attributes, in order", () => {
    const input = buildTemplateInput({
      templateId: "specs_card",
      facts: facts({ attributes: { Material: "Oak", Color: "Grey" } }),
      photoPath: "/tmp/x.png",
    });
    expect(input.specs).toEqual([
      ["Category", "Hatchback"],
      ["Condition", "Used"],
      ["Material", "Oak"],
      ["Color", "Grey"],
    ]);
  });

  it("caps specs at 4, never silently drops category/condition in favour of extra attributes", () => {
    const input = buildTemplateInput({
      templateId: "specs_card",
      facts: facts({ attributes: { A: "1", B: "2", C: "3", D: "4", E: "5" } }),
      photoPath: "/tmp/x.png",
    });
    expect(input.specs).toHaveLength(4);
    expect(input.specs[0]).toEqual(["Category", "Hatchback"]);
    expect(input.specs[1]).toEqual(["Condition", "Used"]);
  });

  it("omits category/condition rows entirely when the item has none, rather than showing blank rows", () => {
    const input = buildTemplateInput({
      templateId: "specs_card",
      facts: facts({ category: null, condition: null, attributes: { Material: "Oak" } }),
      photoPath: "/tmp/x.png",
    });
    expect(input.specs).toEqual([["Material", "Oak"]]);
  });

  it("produces an empty specs array when there is nothing at all to show — never fabricates a spec", () => {
    const input = buildTemplateInput({ templateId: "specs_card", facts: facts({ category: null, condition: null, attributes: {} }), photoPath: "/tmp/x.png" });
    expect(input.specs).toEqual([]);
  });
});

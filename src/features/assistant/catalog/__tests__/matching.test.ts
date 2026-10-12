import { describe, expect, it } from "vitest";

import type { ItemFacts } from "../../domain/types";
import { normalizeText, runSearch } from "../matching";

function item(partial: Partial<ItemFacts> & Pick<ItemFacts, "id" | "name" | "category" | "price">): ItemFacts {
  return {
    categoryLabel: partial.category,
    currency: "KES",
    priceLabel: `KSh ${partial.price}`,
    condition: "new",
    status: "available",
    material: null,
    color: null,
    dimensions: null,
    description: "",
    imageUrl: null,
    ...partial,
  };
}

const CATALOG: ItemFacts[] = [
  item({ id: "a", name: "Compact 2-Seater", category: "sofas", price: 42000, color: "Light grey", material: "Fabric" }),
  item({ id: "b", name: "Big 3-Seater", category: "sofas", price: 68000, color: "Charcoal gray", material: "Woven fabric" }),
  item({ id: "c", name: "Leather 3-Seater", category: "sofas", price: 145000, color: "Tan brown", material: "Genuine leather" }),
  item({ id: "d", name: "Queen Bed", category: "beds", price: 45000, color: "Walnut", material: "Mahogany", condition: "used" }),
];

describe("runSearch — exact matching", () => {
  it("filters by category, colour (grey/gray are the same) and price ceiling", () => {
    const out = runSearch(CATALOG, { category: "sofas", color: "grey", maxPrice: 80000 });
    expect(out.exact.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(out.relaxed).toEqual([]);
  });

  it("respects min/max price inclusively and never mixes categories", () => {
    const out = runSearch(CATALOG, { category: "sofas", minPrice: 68000, maxPrice: 145000 });
    expect(out.exact.map((i) => i.id).sort()).toEqual(["b", "c"]);
  });

  it("filters by material and by condition", () => {
    expect(runSearch(CATALOG, { material: "leather" }).exact.map((i) => i.id)).toEqual(["c"]);
    expect(runSearch(CATALOG, { condition: "used" }).exact.map((i) => i.id)).toEqual(["d"]);
  });

  it("sorts by price when asked and caps results at the limit (max 5)", () => {
    const out = runSearch(CATALOG, { category: "sofas", sort: "price-desc", limit: 2 });
    expect(out.exact.map((i) => i.id)).toEqual(["c", "b"]);
    expect(runSearch(CATALOG, { limit: 99 }).exact.length).toBeLessThanOrEqual(5);
  });

  it("ranks by keyword relevance", () => {
    const out = runSearch(CATALOG, { keywords: "leather genuine" });
    expect(out.exact[0].id).toBe("c");
  });
});

describe("runSearch — honest relaxation", () => {
  it("reports exactly which constraint was relaxed to find alternatives", () => {
    const out = runSearch(CATALOG, { category: "sofas", material: "leather", maxPrice: 60000 });
    expect(out.exact).toEqual([]);
    expect(out.relaxed).toEqual(["material"]);
    expect(out.alternatives.map((i) => i.id).sort()).toEqual(["a"]);
  });

  it("widens the budget by at most 25% and says so", () => {
    const wider = runSearch(CATALOG, { category: "sofas", maxPrice: 40000 });
    expect(wider.exact).toEqual([]);
    expect(wider.relaxed).toEqual(["budget (widened by up to 25%)"]);
    expect(wider.alternatives.map((i) => i.id)).toEqual(["a"]);
  });

  it("never degrades into 'show everything': no constraint left means no alternatives", () => {
    const out = runSearch(CATALOG, { keywords: "chandelier" });
    expect(out.exact).toEqual([]);
    expect(out.alternatives).toEqual([]);
    expect(out.relaxed).toEqual([]);
  });

  it("returns nothing when the category itself has no stock", () => {
    const out = runSearch(CATALOG, { category: "wardrobes", maxPrice: 50000 });
    expect(out.exact).toEqual([]);
    expect(out.alternatives).toEqual([]);
  });
});

describe("normalizeText", () => {
  it("treats gray as grey and strips punctuation", () => {
    expect(normalizeText("Charcoal-Gray!")).toBe("charcoal grey");
  });
});

import { describe, expect, it } from "vitest";

import type { ItemFacts } from "../../domain/types";
import { checkGrounding, extractMoneyAmounts } from "../grounding-guard";

function item(partial: Partial<ItemFacts>): ItemFacts {
  return {
    id: "i1",
    name: "Nairobi 3-Seater Sofa",
    category: "sofas",
    categoryLabel: "Sofas",
    price: 68000,
    currency: "KES",
    priceLabel: "KSh 68,000",
    condition: "new",
    status: "available",
    material: "Woven fabric",
    color: "Charcoal grey",
    dimensions: "210cm x 90cm x 85cm",
    description: "",
    imageUrl: null,
    ...partial,
  };
}

const base = { items: [item({}), item({ id: "i2", name: "Kilimani Compact 2-Seater", price: 42000, dimensions: "150cm x 80cm x 82cm" })], customerText: "I need a grey sofa under 80k", businessFactsText: "" };

describe("extractMoneyAmounts", () => {
  it("reads currency-marked amounts in the usual Kenyan shapes", () => {
    expect(extractMoneyAmounts("KSh 68,000 or Ksh42000 or 1.2M KES or 80k KSh")).toEqual([68000, 42000, 1_200_000, 80_000]);
  });
  it("does not mistake words ending in 'sh' for currency", () => {
    expect(extractMoneyAmounts("A fresh 30 percent gloss finish")).toEqual([]);
  });
});

describe("checkGrounding — money", () => {
  it("accepts prices that came from tool results", () => {
    expect(checkGrounding("The Nairobi 3-Seater Sofa is KSh 68,000.", base).ok).toBe(true);
  });
  it("accepts a number the customer said, and sums of shown items", () => {
    expect(checkGrounding("Both together come to KSh 110,000, within your 80k-per-piece budget.", base).ok).toBe(true);
  });
  it("blocks an invented or altered price", () => {
    const result = checkGrounding("The Nairobi 3-Seater Sofa is KSh 55,000.", base);
    expect(result.ok).toBe(false);
  });
});

describe("checkGrounding — dimensions", () => {
  it("accepts real dimensions and blocks invented ones", () => {
    expect(checkGrounding("It measures 210cm x 90cm x 85cm.", base).ok).toBe(true);
    expect(checkGrounding("It measures 250cm x 100cm.", base).ok).toBe(false);
  });
});

describe("checkGrounding — availability", () => {
  const reserved = { ...base, items: [item({ status: "reserved" })] };
  it("blocks calling a reserved piece available", () => {
    expect(checkGrounding("Good news, the Nairobi 3-Seater Sofa is available right now!", reserved).ok).toBe(false);
  });
  it("allows saying it is reserved or not available", () => {
    expect(checkGrounding("The Nairobi 3-Seater Sofa is currently reserved.", reserved).ok).toBe(true);
    expect(checkGrounding("The Nairobi 3-Seater Sofa is not available at the moment.", reserved).ok).toBe(true);
  });
  it("blocks calling a sold piece in stock", () => {
    expect(checkGrounding("The Nairobi 3-Seater Sofa is in stock.", { ...base, items: [item({ status: "sold" })] }).ok).toBe(false);
  });
});

describe("checkGrounding — promises the business never made", () => {
  it("blocks discounts, free delivery, warranties and financing not in the business facts", () => {
    expect(checkGrounding("We can do 10% off if you buy today.", base).ok).toBe(false);
    expect(checkGrounding("You get free delivery within Nairobi.", base).ok).toBe(false);
    expect(checkGrounding("It comes with a 2 year warranty.", base).ok).toBe(false);
    expect(checkGrounding("Hire purchase is available.", base).ok).toBe(false);
  });
  it("allows them when the business facts cover the topic", () => {
    const withFacts = { ...base, businessFactsText: "Delivery policy: free delivery within Nairobi over KSh 50,000." };
    expect(checkGrounding("You get free delivery within Nairobi.", withFacts).ok).toBe(true);
  });
  it("allows saying it doesn't know", () => {
    expect(checkGrounding("I don't have delivery details, so I'll check with the team.", base).ok).toBe(true);
  });
});

/**
 * Mission 031, Section 6 — "generated content must be grounded in
 * actual inventory data. The AI must not invent specifications,
 * prices, discounts, availability, warranties, financing, delivery
 * promises, dealer claims, customer reviews, or performance
 * statistics."
 *
 * This type is the whitelist: it's the *only* data any content
 * generator (AI or template) ever receives about an item. There is no
 * path from a Vehicle/FurnitureProduct row to generated copy that
 * skips this shape — see item-adapter.ts, the one place that builds a
 * GroundedFacts from a real item.
 *
 * The stronger guarantee is structural, not just a prompt
 * instruction: `priceLabel` and `availabilityLabel` are formatted
 * deterministically by code (see marketing-copy.ts) and are never
 * left to the model to phrase — the model only ever sees them as
 * fixed strings it must reproduce verbatim in a template slot, not as
 * numbers it's free to restate in its own words. `attributes` is the
 * one open-ended bucket (mileage, material, dimensions, ...) and is
 * exactly the dealer-entered/derived fields for that vertical, no more.
 */
export type GroundedFacts = {
  /** e.g. "2021 Toyota Vitz" or "Nairobi 3-Seater Sofa". */
  itemLabel: string;
  /** Deterministically formatted, e.g. "KSh 1,800,000" — see marketing-copy.ts's formatPriceLabel. Never phrased by a generator. */
  priceLabel: string;
  /** e.g. "Available" / "Reserved" / "Sold" — deterministic, never phrased by a generator. */
  availabilityLabel: string;
  category: string | null;
  condition: string | null;
  /** The dealer's own free-text description — safe to paraphrase/reference since the dealer wrote it, unlike attributes a generator might otherwise infer. */
  description: string;
  /** Vertical-specific facts already reduced to display strings (e.g. {"Mileage": "45,000 km"} or {"Material": "Oak", "Dimensions": "180cm x 90cm x 75cm"}). Only non-null fields the item actually has are included — a generator never sees an empty/placeholder attribute to fill in. */
  attributes: Record<string, string>;
};

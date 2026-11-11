/**
 * Mission 031, Section 12 — "do not create AutoMarketingSystem /
 * FurnitureMarketingSystem." Everything in features/marketing/
 * operates on this generic reference, never on `Vehicle` or
 * `FurnitureProduct` directly. Resolving a reference to the actual
 * item (and the facts it's safe to advertise) is the one place that
 * knows about verticals — see item-adapter.ts, which mirrors
 * conversion/domain/catalog-adapter.ts's registry pattern exactly.
 */
export const MARKETABLE_ITEM_TYPES = ["vehicle", "furniture_product"] as const;
export type MarketableItemType = (typeof MARKETABLE_ITEM_TYPES)[number];

export function isMarketableItemType(value: unknown): value is MarketableItemType {
  return typeof value === "string" && (MARKETABLE_ITEM_TYPES as readonly string[]).includes(value);
}

export type MarketableItemRef = {
  itemType: MarketableItemType;
  itemId: string;
};

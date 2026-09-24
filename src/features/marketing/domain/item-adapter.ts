import type { MarketableItemType } from "./marketing-item-ref";
import type { GroundedFacts } from "./grounded-facts";

export type MarketableItem = {
  facts: GroundedFacts;
  /** The item's own `updatedAt` — snapshotted into MarketingContent.sourceUpdatedAt for staleness detection. */
  updatedAt: string;
  primaryPhotoUrl: string | null;
};

/**
 * Mission 031, Section 12 — the one interface every vertical
 * implements once, exactly mirroring
 * conversion/domain/catalog-adapter.ts's CatalogAdapter. Everything
 * in features/marketing/service/ depends on this interface only,
 * never on VehicleService or FurnitureProductService directly.
 */
export interface MarketingItemAdapter {
  getItem(businessId: string, itemId: string): Promise<MarketableItem | null>;
}

const ADAPTERS = new Map<MarketableItemType, MarketingItemAdapter>();

/** Called once at module load by each vertical's adapter file (auto/furniture) — see marketing/service/index.ts for the registration point, matching conversion-service.ts's CATALOG_ADAPTERS wiring. */
export function registerMarketingItemAdapter(itemType: MarketableItemType, adapter: MarketingItemAdapter): void {
  ADAPTERS.set(itemType, adapter);
}

export function getMarketingItemAdapter(itemType: MarketableItemType): MarketingItemAdapter {
  const adapter = ADAPTERS.get(itemType);
  if (!adapter) {
    throw new Error(`No marketing item adapter registered for "${itemType}".`);
  }
  return adapter;
}

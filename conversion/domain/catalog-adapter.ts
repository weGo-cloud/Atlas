/**
 * Mission 027 (correction) — the WeGO Auto Conversion Layer's one
 * genuinely vertical-agnostic seam.
 *
 * The public storefront and the external-integration API both need
 * "the list of things this business currently has available to sell"
 * — but *what* those things are (vehicles today, furniture pieces for
 * a future WeGO Furniture) is entirely vertical-specific. Rather than
 * have the storefront/API code import VehicleService directly (which
 * would make onboarding a second vertical mean rewriting them), both
 * only ever depend on this interface. Adding WeGO Furniture later
 * means writing one new adapter (e.g. FurnitureCatalogAdapter) and
 * registering it — see service/conversion-service.ts's
 * CATALOG_ADAPTERS map — not touching the storefront page, the public
 * API route handlers, or ConversionService's own logic at all.
 */
export type CatalogItem = {
  id: string;
  title: string;
  subtitle: string | null;
  priceLabel: string;
  /** Absolute in-app detail link, when the vertical has one (Auto does — `/app/inventory/[id]` — but that's an authenticated staff route, not a public one; there is no public per-item page yet, see Section "Limitations" in the implementation summary). Null when there's nothing to link to. */
  detailHref: string | null;
  /** Mission 030 — the item's primary photo URL, when it has one. Optional/undefined rather than a required field so AutoCatalogAdapter (which never had photos, and Auto's storefront has never rendered any) doesn't need a behavior change here — only FurnitureCatalogAdapter populates this. */
  imageUrl?: string | null;
};

/**
 * Mission 030 — what a public lead-capture submission's
 * `catalogItemId` resolves to, generalized from the Auto-only
 * `{ vehicleId: string }` shape. A discriminated union rather than a
 * single object with both fields optional: exactly one vertical's
 * reference is ever populated for a given business (a business is
 * always exactly one vertical), so a union makes "populated the wrong
 * one" a type error at every call site instead of a runtime
 * possibility.
 */
export type CatalogItemReference =
  | { vehicleId: string }
  | { furnitureProductId: string };

export interface CatalogAdapter {
  /** e.g. "vehicle" — used in generic storefront/API copy so it never hard-codes "vehicle". */
  itemNounSingular: string;
  itemNounPlural: string;
  listAvailable(businessId: string): Promise<CatalogItem[]>;
  /**
   * Resolves a public lead-capture submission's optional
   * `catalogItemId` into whatever the vertical's own Lead-adjacent
   * schema field is (Auto: `vehicleId`; Furniture: `furnitureProductId`
   * — see domain/lead-intake.ts's `PublicLeadInput`). Returns null if
   * the id doesn't resolve to a currently-available item for this
   * business (never trusts a client-supplied id at face value).
   */
  resolveItemReference(businessId: string, catalogItemId: string): Promise<CatalogItemReference | null>;
}

import type { MarketableItemType } from "./marketing-item-ref";
import type { GroundedFacts } from "./grounded-facts";

export const GENERATION_METHODS = ["ai", "template"] as const;
export type GenerationMethod = (typeof GENERATION_METHODS)[number];

export type MarketingContent = {
  id: string;
  businessId: string;
  itemType: MarketableItemType;
  itemId: string;
  generationMethod: GenerationMethod;
  socialCaption: string;
  whatsappMessage: string;
  groundedFacts: GroundedFacts;
  /** Snapshot of the item's own `updatedAt` at generation time — see isContentStale. */
  sourceUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Mission 031, Section 13 — "if inventory information changes,
 * generated content should be regenerated or reviewed rather than
 * silently retaining stale facts." A pure comparison, not a
 * background job: the item's *current* `updatedAt` is passed in by
 * the caller (which already has it, from loading the item to render
 * the page), so this never needs its own database read. `true` means
 * "the dealer should see a 'this may be outdated — regenerate?'
 * notice", not that the content is deleted or hidden — Section 14's
 * dealer control still applies; nothing here mutates or blocks
 * publishing on its own.
 */
export function isContentStale(content: Pick<MarketingContent, "sourceUpdatedAt">, currentItemUpdatedAt: string): boolean {
  return new Date(content.sourceUpdatedAt).getTime() !== new Date(currentItemUpdatedAt).getTime();
}

import type { MarketableItemType } from "../domain/marketing-item-ref";
import type { MarketingContent } from "../domain/marketing-content";

export type UpsertMarketingContentInput = {
  itemType: MarketableItemType;
  itemId: string;
  generationMethod: MarketingContent["generationMethod"];
  socialCaption: string;
  whatsappMessage: string;
  groundedFacts: MarketingContent["groundedFacts"];
  sourceUpdatedAt: string;
};

export type UpdateMarketingContentInput = Partial<
  Pick<MarketingContent, "socialCaption" | "whatsappMessage">
>;

export interface MarketingContentRepository {
  getByItem(itemType: MarketableItemType, itemId: string): Promise<MarketingContent | null>;
  getById(id: string): Promise<MarketingContent | null>;
  /** Replaces any existing content for this item (Mission 031 — one active draft per item, not a version history; see schema.ts's unique index). */
  upsert(input: UpsertMarketingContentInput): Promise<MarketingContent>;
  update(id: string, input: UpdateMarketingContentInput): Promise<MarketingContent | null>;
}

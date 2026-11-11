import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { marketingContent, type MarketingContentRow } from "@/lib/db/schema";
import type { GroundedFacts } from "../domain/grounded-facts";
import type { MarketableItemType } from "../domain/marketing-item-ref";
import type { MarketingContent, GenerationMethod } from "../domain/marketing-content";
import type {
  MarketingContentRepository,
  UpdateMarketingContentInput,
  UpsertMarketingContentInput,
} from "./marketing-content-repository";

export class DatabaseMarketingContentRepository implements MarketingContentRepository {
  constructor(private readonly businessId: string) {}

  async getByItem(itemType: MarketableItemType, itemId: string): Promise<MarketingContent | null> {
    const rows = await db
      .select()
      .from(marketingContent)
      .where(
        and(
          eq(marketingContent.businessId, this.businessId),
          eq(marketingContent.itemType, itemType),
          eq(marketingContent.itemId, itemId)
        )
      )
      .limit(1);
    return rows[0] ? toMarketingContent(rows[0]) : null;
  }

  async getById(id: string): Promise<MarketingContent | null> {
    const rows = await db
      .select()
      .from(marketingContent)
      .where(and(eq(marketingContent.id, id), eq(marketingContent.businessId, this.businessId)))
      .limit(1);
    return rows[0] ? toMarketingContent(rows[0]) : null;
  }

  async upsert(input: UpsertMarketingContentInput): Promise<MarketingContent> {
    const existing = await this.getByItem(input.itemType, input.itemId);
    const now = new Date().toISOString();

    if (existing) {
      await db
        .update(marketingContent)
        .set({
          generationMethod: input.generationMethod,
          socialCaption: input.socialCaption,
          whatsappMessage: input.whatsappMessage,
          groundedFactsJson: JSON.stringify(input.groundedFacts),
          sourceUpdatedAt: input.sourceUpdatedAt,
          updatedAt: now,
        })
        .where(eq(marketingContent.id, existing.id));
      const updated = await this.getById(existing.id);
      if (!updated) throw new Error("Failed to read back updated marketing content.");
      return updated;
    }

    const id = generateId();
    await db.insert(marketingContent).values({
      id,
      businessId: this.businessId,
      itemType: input.itemType,
      itemId: input.itemId,
      generationMethod: input.generationMethod,
      socialCaption: input.socialCaption,
      whatsappMessage: input.whatsappMessage,
      groundedFactsJson: JSON.stringify(input.groundedFacts),
      sourceUpdatedAt: input.sourceUpdatedAt,
      createdAt: now,
      updatedAt: now,
    });
    const created = await this.getById(id);
    if (!created) throw new Error("Failed to read back newly created marketing content.");
    return created;
  }

  async update(id: string, input: UpdateMarketingContentInput): Promise<MarketingContent | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    await db
      .update(marketingContent)
      .set({
        ...(input.socialCaption !== undefined ? { socialCaption: input.socialCaption } : {}),
        ...(input.whatsappMessage !== undefined ? { whatsappMessage: input.whatsappMessage } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(marketingContent.id, id), eq(marketingContent.businessId, this.businessId)));

    return this.getById(id);
  }
}

function toMarketingContent(row: MarketingContentRow): MarketingContent {
  return {
    id: row.id,
    businessId: row.businessId,
    itemType: row.itemType as MarketableItemType,
    itemId: row.itemId,
    generationMethod: row.generationMethod as GenerationMethod,
    socialCaption: row.socialCaption,
    whatsappMessage: row.whatsappMessage,
    groundedFacts: JSON.parse(row.groundedFactsJson) as GroundedFacts,
    sourceUpdatedAt: row.sourceUpdatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `mkt_${Date.now().toString(36)}${counter.toString(36)}`;
}

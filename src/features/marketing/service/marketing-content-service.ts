import { getContentGenerator, AiGenerationError, type ContentGenerator } from "../ai/content-generator";
import { getMarketingItemAdapter } from "../domain/item-adapter";
import { assembleSocialCaption, assembleWhatsAppMessage, findUngroundedNumbers, buildTemplateBlurb } from "../domain/marketing-copy";
import type { MarketableItemRef } from "../domain/marketing-item-ref";
import type { MarketingContent } from "../domain/marketing-content";
import { fail, ok, type MarketingResult } from "../domain/errors";
import type { MarketingContentRepository, UpdateMarketingContentInput } from "../repository/marketing-content-repository";

/**
 * Mission 031 — the one place inventory data turns into marketing
 * copy. Every step here is grounded (Section 6): `getItem` returns
 * GroundedFacts built entirely by the vertical's own adapter (never
 * this service reaching into Vehicle/FurnitureProduct fields
 * directly), and `findUngroundedNumbers` is a second, structural
 * check after generation — if the model states a figure that isn't
 * anywhere in the facts it was given, this service silently falls
 * back to the deterministic template blurb for that generation rather
 * than shipping a possibly-fabricated number to the dealer. That
 * fallback is recorded honestly: `generationMethod` reflects what was
 * actually used, not what was attempted.
 */
export class MarketingContentService {
  constructor(
    private readonly repository: MarketingContentRepository,
    private readonly businessId: string,
    private readonly generator: ContentGenerator = getContentGenerator()
  ) {}

  async generateContent(itemRef: MarketableItemRef): Promise<MarketingResult<MarketingContent>> {
    const adapter = getMarketingItemAdapter(itemRef.itemType);
    const item = await adapter.getItem(this.businessId, itemRef.itemId);
    if (!item) {
      return fail({ code: "ITEM_NOT_FOUND", message: "That inventory item was not found." });
    }

    let method: MarketingContent["generationMethod"];
    let blurb: string;
    try {
      const generated = await this.generator.generateBlurb(item.facts);
      const ungrounded = findUngroundedNumbers(generated.blurb, item.facts);
      if (ungrounded.length > 0) {
        // The model stated a number that appears nowhere in the
        // facts it was given — fall back to the deterministic
        // template rather than risk shipping a fabricated figure.
        method = "template";
        blurb = buildTemplateBlurb(item.facts);
      } else {
        method = generated.method;
        blurb = generated.blurb;
      }
    } catch (error) {
      if (error instanceof AiGenerationError) {
        return fail({ code: "AI_REQUEST_FAILED", message: error.message });
      }
      throw error;
    }

    try {
      const content = await this.repository.upsert({
        itemType: itemRef.itemType,
        itemId: itemRef.itemId,
        generationMethod: method,
        socialCaption: assembleSocialCaption(item.facts, blurb),
        whatsappMessage: assembleWhatsAppMessage(item.facts, blurb),
        groundedFacts: item.facts,
        sourceUpdatedAt: item.updatedAt,
      });
      return ok(content);
    } catch {
      return fail({ code: "REPOSITORY_ERROR", message: "Could not save the generated content. Please try again." });
    }
  }

  async getContent(itemRef: MarketableItemRef): Promise<MarketingContent | null> {
    return this.repository.getByItem(itemRef.itemType, itemRef.itemId);
  }

  /** Section 14 — dealer control: the dealer can edit either message before it's ever published. */
  async updateContent(contentId: string, input: UpdateMarketingContentInput): Promise<MarketingResult<MarketingContent>> {
    if (input.socialCaption !== undefined && !input.socialCaption.trim()) {
      return fail({ code: "VALIDATION_ERROR", message: "Social caption cannot be empty." });
    }
    if (input.whatsappMessage !== undefined && !input.whatsappMessage.trim()) {
      return fail({ code: "VALIDATION_ERROR", message: "WhatsApp message cannot be empty." });
    }

    const updated = await this.repository.update(contentId, input);
    if (!updated) {
      return fail({ code: "CONTENT_NOT_FOUND", message: "That content was not found." });
    }
    return ok(updated);
  }
}

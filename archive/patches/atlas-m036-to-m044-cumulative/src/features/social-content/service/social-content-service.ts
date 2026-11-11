import { getMarketingContentService } from "../../marketing/service";
import type { MarketableItemRef } from "../../marketing/domain/marketing-item-ref";
import { buildTemplateInput } from "../domain/build-template-input";
import { fail, ok, type SocialContentResult } from "../domain/errors";
import { getItemPhotosPort } from "../domain/item-photos-port";
import { getPhotoPathResolver } from "../domain/photo-path-resolver";
import type { PostTemplateId, SocialPost } from "../domain/social-post";
import { RenderError, renderTemplateToPng } from "../render/render-engine";
import type { SocialPostRepository } from "../repository/social-post-repository";
import { saveSocialPostImage } from "@/lib/storage/social-post-storage";

export type GeneratePostInput = MarketableItemRef & {
  templateId: PostTemplateId;
  /** Which of the item's real photos to use — required, and must belong to this item (checked against ItemPhotosPort, never trusted as-is). */
  photoUrl: string;
};

/**
 * Mission 034 — composes the M031 grounded-caption pipeline
 * (MarketingContentService, reused unchanged) with the self-hosted
 * template renderer. Nothing here writes prose or picks a photo on
 * its own: the caption comes from MarketingContentService's own
 * grounding guarantee, and the photo is whichever real, already-
 * uploaded photo the caller (staff, via the UI) explicitly chose.
 */
export class SocialContentService {
  constructor(
    private readonly repository: SocialPostRepository,
    private readonly businessId: string
  ) {}

  async generate(input: GeneratePostInput): Promise<SocialContentResult<SocialPost>> {
    const itemRef: MarketableItemRef = { itemType: input.itemType, itemId: input.itemId };

    // The photo must be one of THIS item's own real photos — never trust a client-supplied URL as-is.
    const photos = await getItemPhotosPort(input.itemType).listPhotos(this.businessId, input.itemId);
    const photo = photos.find((candidate) => candidate.url === input.photoUrl);
    if (!photo) {
      return fail({ code: "PHOTO_NOT_FOUND", message: "That photo was not found on this item." });
    }
    const photoPath = getPhotoPathResolver(input.itemType).resolve(input.itemId, photo.url);
    if (!photoPath) {
      return fail({ code: "PHOTO_NOT_FOUND", message: "That photo could not be located on disk." });
    }

    // Reuse the existing grounded caption — generating one if none exists yet, or if the item has changed since.
    const marketingService = getMarketingContentService(this.businessId);
    let content = await marketingService.getContent(itemRef);
    if (!content) {
      const generated = await marketingService.generateContent(itemRef);
      if (!generated.ok) {
        return fail({ code: "CAPTION_UNAVAILABLE", message: generated.error.message });
      }
      content = generated.data;
    }

    const templateInput = buildTemplateInput({ templateId: input.templateId, facts: content.groundedFacts, photoPath });

    let png: Buffer;
    try {
      png = await renderTemplateToPng(templateInput);
    } catch (error) {
      return fail({ code: "RENDER_FAILED", message: error instanceof RenderError ? error.message : "Could not generate the post image." });
    }

    let saved: { url: string };
    try {
      saved = await saveSocialPostImage({ businessId: this.businessId, buffer: png });
    } catch {
      return fail({ code: "REPOSITORY_ERROR", message: "Could not save the generated image." });
    }

    try {
      const post = await this.repository.create({
        itemType: input.itemType,
        itemId: input.itemId,
        templateId: input.templateId,
        photoUrl: photo.url,
        caption: content.socialCaption,
        imageUrl: saved.url,
      });
      return ok(post);
    } catch {
      return fail({ code: "REPOSITORY_ERROR", message: "Could not save the generated post. Please try again." });
    }
  }

  async updateCaption(postId: string, caption: string): Promise<SocialContentResult<SocialPost>> {
    if (!caption.trim()) {
      return fail({ code: "VALIDATION_ERROR", message: "Caption cannot be empty." });
    }
    const existing = await this.repository.getById(postId);
    if (!existing) return fail({ code: "POST_NOT_FOUND", message: "That post was not found." });
    if (existing.status === "approved") {
      return fail({ code: "ALREADY_APPROVED", message: "This post is already approved and can no longer be edited." });
    }
    const updated = await this.repository.updateCaption(postId, caption.trim());
    if (!updated) return fail({ code: "POST_NOT_FOUND", message: "That post was not found." });
    return ok(updated);
  }

  async approve(postId: string, now: string = new Date().toISOString()): Promise<SocialContentResult<SocialPost>> {
    const existing = await this.repository.getById(postId);
    if (!existing) return fail({ code: "POST_NOT_FOUND", message: "That post was not found." });
    const approved = await this.repository.approve(postId, now);
    if (!approved) {
      return fail({ code: "ALREADY_APPROVED", message: "This post is already approved." });
    }
    return ok(approved);
  }

  async delete(postId: string): Promise<boolean> {
    return this.repository.delete(postId);
  }

  async getById(postId: string): Promise<SocialPost | null> {
    return this.repository.getById(postId);
  }

  async list(filter?: { status?: SocialPost["status"] }): Promise<SocialPost[]> {
    return this.repository.list(filter);
  }
}

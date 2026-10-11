import type { MarketableItemType } from "../../marketing/domain/marketing-item-ref";

/**
 * Mission 034 — a self-hosted, templated image post generated from a
 * real inventory item's real photo and real facts (via the M031
 * MarketingItemAdapter/GroundedFacts seam — no separate fact source).
 * No AI image/video generation anywhere in this feature: the "content"
 * is a real photo already on the item, composed into a coded layout.
 */
export const POST_TEMPLATES = ["featured_item", "price_highlight", "specs_card"] as const;
export type PostTemplateId = (typeof POST_TEMPLATES)[number];

export const POST_TEMPLATE_LABEL: Record<PostTemplateId, string> = {
  featured_item: "Featured item",
  price_highlight: "Price highlight",
  specs_card: "Specs card",
};

export const POST_TEMPLATE_DESCRIPTION: Record<PostTemplateId, string> = {
  featured_item: "Full photo with name, price and a status badge — a clean general-purpose post.",
  price_highlight: "Photo with a bold price treatment — good for a deal or price-drop post.",
  specs_card: "Photo alongside up to four key specs, laid out for detail-focused shoppers.",
};

export const POST_STATUSES = ["draft", "approved"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export type SocialPost = {
  id: string;
  businessId: string;
  itemType: MarketableItemType;
  itemId: string;
  templateId: PostTemplateId;
  photoUrl: string;
  caption: string;
  imageUrl: string;
  status: PostStatus;
  createdAt: string;
  approvedAt: string | null;
};

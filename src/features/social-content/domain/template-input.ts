import type { PostTemplateId } from "./social-post";

/**
 * Mission 034 — the ONLY thing a template renderer ever receives.
 * Structured, not raw HTML: every template implementation (any
 * vertical, any future template) takes the same shape, so a template
 * can't accidentally be handed a raw string to interpolate unsafely,
 * and adding a template never requires touching the caller.
 *
 * Every field here already comes from GroundedFacts (M031) or a real
 * uploaded photo — there is no field a template could use to display
 * something the rest of Atlas hasn't already verified.
 */
export type TemplateInput = {
  templateId: PostTemplateId;
  /** e.g. "2021 Toyota Vitz" — same GroundedFacts.itemLabel used in marketing copy. */
  itemLabel: string;
  /** Deterministically formatted, e.g. "KSh 1,800,000" — never re-derived here. */
  priceLabel: string;
  /** e.g. "Available" — shown as a badge; never fabricated if absent. */
  availabilityLabel: string;
  /** Up to 4 label/value pairs, e.g. [["Mileage","45,000 km"]] or [["Material","Oak"],["Dimensions","180cm x 90cm x 75cm"]]. */
  specs: Array<[label: string, value: string]>;
  /** Absolute filesystem path to a real, already-uploaded photo. Required — a template is never asked to render without one. */
  photoPath: string;
};

export const POST_IMAGE_WIDTH = 1080;
export const POST_IMAGE_HEIGHT = 1080;

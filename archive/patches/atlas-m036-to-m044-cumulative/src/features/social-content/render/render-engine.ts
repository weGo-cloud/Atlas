import { readFile } from "node:fs/promises";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import { detectImageMimeType } from "@/lib/storage/photo-storage";
import { loadBrandFonts } from "./fonts";
import { POST_IMAGE_HEIGHT, POST_IMAGE_WIDTH, type TemplateInput } from "../domain/template-input";
import { renderFeaturedItem } from "./templates/featured-item";
import { renderPriceHighlight } from "./templates/price-highlight";
import { renderSpecsCard } from "./templates/specs-card";

export class RenderError extends Error {}

/**
 * A template is a pure function from (input, photo as a data: URI) to a
 * satori element tree — no JSX, plain object literals (see
 * templates/*.ts). satori's real parameter type is React's ReactNode,
 * which plain duck-typed {type,props} objects don't structurally
 * satisfy even though satori accepts them at runtime (this is
 * satori's own documented non-JSX usage) — TemplateNode is `unknown`
 * so template files stay free of a React type-only dependency, and
 * the one unavoidable cast happens right where satori is called,
 * below.
 */
export type TemplateNode = unknown;
type TemplateRenderer = (input: TemplateInput, photoDataUrl: string) => TemplateNode;

const RENDERERS: Record<TemplateInput["templateId"], TemplateRenderer> = {
  featured_item: renderFeaturedItem,
  price_highlight: renderPriceHighlight,
  specs_card: renderSpecsCard,
};

/**
 * Mission 034 — the one place a TemplateInput becomes real PNG bytes.
 * Self-hosted (satori: layout → SVG, resvg: SVG → PNG) — no external
 * design API, no network call, no per-image cost or rate limit.
 * Every template implementation is a pure function; this is the only
 * place that touches the filesystem (to embed the real photo as a
 * data URI, since satori has no access to Atlas's own auth-gated photo
 * route) or the rendering libraries.
 */
export async function renderTemplateToPng(input: TemplateInput): Promise<Buffer> {
  let photoBuffer: Buffer;
  try {
    photoBuffer = await readFile(input.photoPath);
  } catch {
    throw new RenderError("The photo for this item could not be read.");
  }
  const mimeType = detectImageMimeType(photoBuffer);
  if (!mimeType) {
    throw new RenderError("The photo for this item is not a supported image format.");
  }
  const photoDataUrl = `data:${mimeType};base64,${photoBuffer.toString("base64")}`;

  const build = RENDERERS[input.templateId];
  if (!build) throw new RenderError(`Unknown template "${input.templateId}".`);

  let svg: string;
  try {
    svg = await satori(build(input, photoDataUrl) as never, {
      width: POST_IMAGE_WIDTH,
      height: POST_IMAGE_HEIGHT,
      fonts: loadBrandFonts(),
    });
  } catch (error) {
    throw new RenderError(error instanceof Error ? `Could not lay out the post: ${error.message}` : "Could not lay out the post.");
  }

  try {
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: POST_IMAGE_WIDTH } });
    return Buffer.from(resvg.render().asPng());
  } catch {
    throw new RenderError("Could not render the post image.");
  }
}

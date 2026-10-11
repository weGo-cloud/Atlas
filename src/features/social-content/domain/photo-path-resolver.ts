import type { MarketableItemType } from "../../marketing/domain/marketing-item-ref";

/**
 * Mission 034 — mirrors MarketingItemAdapter's per-vertical registry
 * pattern exactly (marketing/domain/item-adapter.ts). A photo's public
 * `url` (e.g. "/uploads/vehicles/{id}/{filename}.jpg") is what
 * GroundedFacts/MarketableItem carry; the renderer needs the real
 * filesystem bytes, which only each vertical's own storage module
 * (`resolveVehiclePhotoPath` / `resolveFurniturePhotoPath`) knows how
 * to resolve safely. This is the one seam between the two, so the
 * render engine never has to know a vertical exists.
 */
export interface PhotoPathResolver {
  /** Resolves a photo's public URL (as stored on the item) to an absolute filesystem path, or null if it doesn't match that vertical's own safe filename pattern. */
  resolve(itemId: string, photoUrl: string): string | null;
}

const RESOLVERS = new Map<MarketableItemType, PhotoPathResolver>();

export function registerPhotoPathResolver(itemType: MarketableItemType, resolver: PhotoPathResolver): void {
  RESOLVERS.set(itemType, resolver);
}

export function getPhotoPathResolver(itemType: MarketableItemType): PhotoPathResolver {
  const resolver = RESOLVERS.get(itemType);
  if (!resolver) throw new Error(`No photo path resolver registered for "${itemType}".`);
  return resolver;
}

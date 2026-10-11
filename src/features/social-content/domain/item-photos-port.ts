import type { MarketableItemType } from "../../marketing/domain/marketing-item-ref";

export type ItemPhoto = { id: string; url: string; isPrimary: boolean };

/**
 * Mission 034 — third and last per-vertical seam this feature needs
 * (alongside MarketingItemAdapter, reused unchanged, and
 * PhotoPathResolver above): lists an item's real uploaded photos so
 * staff can pick one, without this feature importing
 * VehiclePhotoService/FurnitureProductPhotoService directly.
 */
export interface ItemPhotosPort {
  listPhotos(businessId: string, itemId: string): Promise<ItemPhoto[]>;
}

const PORTS = new Map<MarketableItemType, ItemPhotosPort>();

export function registerItemPhotosPort(itemType: MarketableItemType, port: ItemPhotosPort): void {
  PORTS.set(itemType, port);
}

export function getItemPhotosPort(itemType: MarketableItemType): ItemPhotosPort {
  const port = PORTS.get(itemType);
  if (!port) throw new Error(`No item-photos port registered for "${itemType}".`);
  return port;
}

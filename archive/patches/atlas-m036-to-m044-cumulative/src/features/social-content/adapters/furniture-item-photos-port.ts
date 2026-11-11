import { getFurnitureProductPhotoService } from "@/features/furniture/service";
import type { ItemPhoto, ItemPhotosPort } from "../domain/item-photos-port";

export class FurnitureItemPhotosPort implements ItemPhotosPort {
  async listPhotos(businessId: string, itemId: string): Promise<ItemPhoto[]> {
    const result = await getFurnitureProductPhotoService(businessId).listPhotos(itemId);
    if (!result.ok) return [];
    return result.data.map((photo) => ({ id: photo.id, url: photo.url, isPrimary: photo.isPrimary }));
  }
}

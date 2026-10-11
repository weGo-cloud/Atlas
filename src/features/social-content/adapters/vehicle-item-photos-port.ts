import { getVehiclePhotoService } from "@/features/inventory/service";
import type { ItemPhoto, ItemPhotosPort } from "../domain/item-photos-port";

export class VehicleItemPhotosPort implements ItemPhotosPort {
  async listPhotos(businessId: string, itemId: string): Promise<ItemPhoto[]> {
    const result = await getVehiclePhotoService(businessId).listPhotos(itemId);
    if (!result.ok) return [];
    return result.data.map((photo) => ({ id: photo.id, url: photo.url, isPrimary: photo.isPrimary }));
  }
}

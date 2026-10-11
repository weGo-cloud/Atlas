import { resolveVehiclePhotoPath } from "@/lib/storage/vehicle-photo-storage";
import type { PhotoPathResolver } from "../domain/photo-path-resolver";

const URL_PATTERN = /^\/uploads\/vehicles\/([^/]+)\/([^/]+)$/;

export class VehiclePhotoPathResolver implements PhotoPathResolver {
  resolve(itemId: string, photoUrl: string): string | null {
    const match = URL_PATTERN.exec(photoUrl);
    if (!match || match[1] !== itemId) return null;
    return resolveVehiclePhotoPath(itemId, match[2]);
  }
}

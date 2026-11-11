import { resolveFurniturePhotoPath } from "@/lib/storage/furniture-photo-storage";
import type { PhotoPathResolver } from "../domain/photo-path-resolver";

const URL_PATTERN = /^\/uploads\/furniture-products\/([^/]+)\/([^/]+)$/;

export class FurniturePhotoPathResolver implements PhotoPathResolver {
  resolve(itemId: string, photoUrl: string): string | null {
    const match = URL_PATTERN.exec(photoUrl);
    if (!match || match[1] !== itemId) return null;
    return resolveFurniturePhotoPath(itemId, match[2]);
  }
}

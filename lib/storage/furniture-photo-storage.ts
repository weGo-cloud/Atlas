import type { AcceptedPhotoMimeType } from "@/features/furniture/domain/furniture-product-photo";
import {
  deletePhoto,
  detectImageMimeType as detectImageMimeTypeGeneric,
  resolvePhotoPath,
  savePhoto,
  type SavedPhotoFile,
} from "./photo-storage";

/**
 * Mission 030 — the Furniture vertical's counterpart to
 * vehicle-photo-storage.ts, both thin wrappers around the same
 * generalized photo-storage.ts core. See that module's doc comment.
 *
 * Unlike vehicle photos, furniture photos are served *publicly* (see
 * `src/app/uploads/furniture-products/[productId]/[filename]/route.ts`)
 * — the furniture storefront (Mission 030, Section 11) needs to show
 * images to anonymous visitors, something the Auto storefront has
 * never done (it lists text only — see conversion/domain/catalog-adapter.ts's
 * CatalogItem, which had no image field before this mission). That's
 * additive, not a regression: no existing vehicle photo becomes any
 * more or less public than it already was.
 */
const NAMESPACE = "furniture-products";
const URL_PREFIX = "uploads/furniture-products";

function storageDirOverride(): string | undefined {
  return process.env.FURNITURE_PHOTO_STORAGE_DIR;
}

export function detectImageMimeType(buffer: Buffer): AcceptedPhotoMimeType | null {
  return detectImageMimeTypeGeneric(buffer);
}

export type { SavedPhotoFile };

export async function saveFurniturePhoto(input: {
  furnitureProductId: string;
  buffer: Buffer;
  mimeType: AcceptedPhotoMimeType;
}): Promise<SavedPhotoFile> {
  return savePhoto({
    namespace: NAMESPACE,
    urlPrefix: URL_PREFIX,
    ownerId: input.furnitureProductId,
    buffer: input.buffer,
    mimeType: input.mimeType,
    storageDirEnvOverride: storageDirOverride(),
  });
}

export async function deleteFurniturePhoto(url: string): Promise<void> {
  return deletePhoto({
    namespace: NAMESPACE,
    urlPrefix: URL_PREFIX,
    url,
    storageDirEnvOverride: storageDirOverride(),
  });
}

export function resolveFurniturePhotoPath(furnitureProductId: string, filename: string): string | null {
  return resolvePhotoPath({
    namespace: NAMESPACE,
    ownerId: furnitureProductId,
    filename,
    storageDirEnvOverride: storageDirOverride(),
  });
}

import { failPhoto, okPhoto, type FurniturePhotoResult } from "../domain/photo-errors";
import { MAX_PHOTO_SIZE_BYTES, MAX_PHOTOS_PER_PRODUCT, type FurnitureProductPhoto } from "../domain/furniture-product-photo";
import type { FurnitureProductPhotoRepository } from "../repository/furniture-product-photo-repository";
import type { FurnitureProductRepository } from "../repository/furniture-product-repository";
import {
  deleteFurniturePhoto,
  detectImageMimeType,
  saveFurniturePhoto,
} from "@/lib/storage/furniture-photo-storage";

export type UploadFileInput = {
  fileName: string;
  buffer: Buffer;
  size: number;
};

export type UploadOutcome =
  | { fileName: string; ok: true; photo: FurnitureProductPhoto }
  | { fileName: string; ok: false; error: string };

/**
 * Business-facing entry point for furniture photo operations —
 * mirrors VehiclePhotoService's shape and validation order (capacity,
 * empty file, size, then magic-byte type detection) exactly.
 */
export class FurnitureProductPhotoService {
  constructor(
    private readonly photoRepository: FurnitureProductPhotoRepository,
    private readonly productRepository: FurnitureProductRepository
  ) {}

  async listPhotos(productId: string): Promise<FurniturePhotoResult<FurnitureProductPhoto[]>> {
    const product = await this.productRepository.getById(productId);
    if (!product) {
      return failPhoto({ code: "PRODUCT_NOT_FOUND", message: `Furniture product "${productId}" was not found.` });
    }
    return okPhoto(await this.photoRepository.listByProductId(productId));
  }

  /** Batched primary-photo lookup for inventory list views. */
  async listPrimaryForProducts(productIds: string[]): Promise<Map<string, FurnitureProductPhoto>> {
    return this.photoRepository.listPrimaryForProductIds(productIds);
  }

  async uploadPhotos(productId: string, files: UploadFileInput[]): Promise<FurniturePhotoResult<UploadOutcome[]>> {
    const product = await this.productRepository.getById(productId);
    if (!product) {
      return failPhoto({ code: "PRODUCT_NOT_FOUND", message: `Furniture product "${productId}" was not found.` });
    }

    const existingCount = await this.photoRepository.countByProductId(productId);
    const remainingSlots = Math.max(0, MAX_PHOTOS_PER_PRODUCT - existingCount);

    const outcomes: UploadOutcome[] = [];

    for (const [index, file] of files.entries()) {
      if (index >= remainingSlots) {
        outcomes.push({
          fileName: file.fileName,
          ok: false,
          error: `Product already has the maximum of ${MAX_PHOTOS_PER_PRODUCT} photos.`,
        });
        continue;
      }

      if (file.size === 0) {
        outcomes.push({ fileName: file.fileName, ok: false, error: "File is empty." });
        continue;
      }

      if (file.size > MAX_PHOTO_SIZE_BYTES) {
        outcomes.push({
          fileName: file.fileName,
          ok: false,
          error: `File exceeds the ${Math.round(MAX_PHOTO_SIZE_BYTES / (1024 * 1024))}MB limit.`,
        });
        continue;
      }

      const detectedType = detectImageMimeType(file.buffer);
      if (!detectedType) {
        outcomes.push({ fileName: file.fileName, ok: false, error: "Unsupported file type. Use JPEG, PNG, or WEBP." });
        continue;
      }

      try {
        const saved = await saveFurniturePhoto({ furnitureProductId: productId, buffer: file.buffer, mimeType: detectedType });
        const photo = await this.photoRepository.add({ furnitureProductId: productId, url: saved.url });
        outcomes.push({ fileName: file.fileName, ok: true, photo });
      } catch {
        outcomes.push({ fileName: file.fileName, ok: false, error: "Could not save the file. Please try again." });
      }
    }

    return okPhoto(outcomes);
  }

  async removePhoto(productId: string, photoId: string): Promise<FurniturePhotoResult<FurnitureProductPhoto[]>> {
    const product = await this.productRepository.getById(productId);
    if (!product) {
      return failPhoto({ code: "PRODUCT_NOT_FOUND", message: `Furniture product "${productId}" was not found.` });
    }

    const photo = await this.photoRepository.getById(photoId);
    if (!photo || photo.furnitureProductId !== productId) {
      return failPhoto({ code: "PHOTO_NOT_FOUND", message: "Photo was not found." });
    }

    try {
      await deleteFurniturePhoto(photo.url);
    } catch {
      // Best-effort — an orphaned file is recoverable manually later.
    }

    const removed = await this.photoRepository.remove(photoId);
    if (!removed) {
      return failPhoto({ code: "PHOTO_NOT_FOUND", message: "Photo was not found." });
    }

    return okPhoto(await this.photoRepository.listByProductId(productId));
  }

  async reorderPhotos(productId: string, orderedIds: string[]): Promise<FurniturePhotoResult<FurnitureProductPhoto[]>> {
    const product = await this.productRepository.getById(productId);
    if (!product) {
      return failPhoto({ code: "PRODUCT_NOT_FOUND", message: `Furniture product "${productId}" was not found.` });
    }
    return okPhoto(await this.photoRepository.reorder(productId, orderedIds));
  }

  async setPrimaryPhoto(productId: string, photoId: string): Promise<FurniturePhotoResult<FurnitureProductPhoto[]>> {
    const product = await this.productRepository.getById(productId);
    if (!product) {
      return failPhoto({ code: "PRODUCT_NOT_FOUND", message: `Furniture product "${productId}" was not found.` });
    }

    const photo = await this.photoRepository.getById(photoId);
    if (!photo || photo.furnitureProductId !== productId) {
      return failPhoto({ code: "PHOTO_NOT_FOUND", message: "Photo was not found." });
    }
    return okPhoto(await this.photoRepository.setPrimary(productId, photoId));
  }
}

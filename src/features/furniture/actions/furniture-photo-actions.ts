"use server";

import { revalidatePath } from "next/cache";

import { getFurnitureProductPhotoService } from "../service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import type { FurnitureProductPhoto } from "../domain/furniture-product-photo";
import type { FurniturePhotoServiceError } from "../domain/photo-errors";
import type { UploadOutcome } from "../service/furniture-product-photo-service";

export type FurniturePhotoActionResult =
  | { ok: true; photos: FurnitureProductPhoto[] }
  | { ok: false; error: FurniturePhotoServiceError };

export type UploadFurniturePhotosActionResult =
  | { ok: true; outcomes: UploadOutcome[]; photos: FurnitureProductPhoto[] }
  | { ok: false; error: FurniturePhotoServiceError };

function revalidateFurniturePaths(productId: string) {
  revalidatePath("/app/inventory");
  revalidatePath(`/app/inventory/${productId}`);
  revalidatePath(`/app/inventory/${productId}/edit`);
}

export async function uploadFurniturePhotosAction(
  productId: string,
  formData: FormData
): Promise<UploadFurniturePhotosActionResult> {
  const fileEntries = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

  const files = await Promise.all(
    fileEntries.map(async (file) => ({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      size: file.size,
    }))
  );

  const { business } = await requireCurrentSession();
  const photoService = getFurnitureProductPhotoService(business.id);
  const result = await photoService.uploadPhotos(productId, files);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFurniturePaths(productId);

  const photosResult = await photoService.listPhotos(productId);
  return { ok: true, outcomes: result.data, photos: photosResult.ok ? photosResult.data : [] };
}

export async function deleteFurniturePhotoAction(
  productId: string,
  photoId: string
): Promise<FurniturePhotoActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getFurnitureProductPhotoService(business.id).removePhoto(productId, photoId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFurniturePaths(productId);
  return { ok: true, photos: result.data };
}

export async function reorderFurniturePhotosAction(
  productId: string,
  orderedIds: string[]
): Promise<FurniturePhotoActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getFurnitureProductPhotoService(business.id).reorderPhotos(productId, orderedIds);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFurniturePaths(productId);
  return { ok: true, photos: result.data };
}

export async function setPrimaryFurniturePhotoAction(
  productId: string,
  photoId: string
): Promise<FurniturePhotoActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getFurnitureProductPhotoService(business.id).setPrimaryPhoto(productId, photoId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFurniturePaths(productId);
  return { ok: true, photos: result.data };
}

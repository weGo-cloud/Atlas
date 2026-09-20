"use server";

import { revalidatePath } from "next/cache";

import { getVehiclePhotoService } from "../service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import type { VehiclePhoto } from "../domain/vehicle-photo";
import type { PhotoServiceError } from "../domain/photo-errors";
import type { UploadOutcome } from "../service/vehicle-photo-service";

export type PhotoActionResult =
  | { ok: true; photos: VehiclePhoto[] }
  | { ok: false; error: PhotoServiceError };

export type UploadPhotosActionResult =
  | { ok: true; outcomes: UploadOutcome[]; photos: VehiclePhoto[] }
  | { ok: false; error: PhotoServiceError };

function revalidateVehiclePaths(vehicleId: string) {
  revalidatePath("/app/inventory");
  revalidatePath(`/app/inventory/${vehicleId}`);
  revalidatePath(`/app/inventory/${vehicleId}/edit`);
}

/**
 * Uploads one or more photos for a vehicle. Accepts FormData so this
 * can be called directly with browser File objects — every entry
 * under the "files" key is treated as a file to upload. Validation
 * (type, size, count) happens server-side in VehiclePhotoService;
 * this action only translates FormData into the buffers the service
 * expects.
 */
export async function uploadVehiclePhotosAction(
  vehicleId: string,
  formData: FormData
): Promise<UploadPhotosActionResult> {
  const fileEntries = formData.getAll("files").filter(
    (entry): entry is File => entry instanceof File
  );

  const files = await Promise.all(
    fileEntries.map(async (file) => ({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      size: file.size,
    }))
  );

  const { business } = await requireCurrentSession();
  const vehiclePhotoService = getVehiclePhotoService(business.id);
  const result = await vehiclePhotoService.uploadPhotos(vehicleId, files);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateVehiclePaths(vehicleId);

  const photosResult = await vehiclePhotoService.listPhotos(vehicleId);
  return {
    ok: true,
    outcomes: result.data,
    photos: photosResult.ok ? photosResult.data : [],
  };
}

export async function deleteVehiclePhotoAction(
  vehicleId: string,
  photoId: string
): Promise<PhotoActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getVehiclePhotoService(business.id).removePhoto(vehicleId, photoId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateVehiclePaths(vehicleId);
  return { ok: true, photos: result.data };
}

export async function reorderVehiclePhotosAction(
  vehicleId: string,
  orderedIds: string[]
): Promise<PhotoActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getVehiclePhotoService(business.id).reorderPhotos(vehicleId, orderedIds);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateVehiclePaths(vehicleId);
  return { ok: true, photos: result.data };
}

export async function setPrimaryVehiclePhotoAction(
  vehicleId: string,
  photoId: string
): Promise<PhotoActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getVehiclePhotoService(business.id).setPrimaryPhoto(vehicleId, photoId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateVehiclePaths(vehicleId);
  return { ok: true, photos: result.data };
}

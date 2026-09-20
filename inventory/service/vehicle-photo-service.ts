import { failPhoto, okPhoto, type PhotoResult } from "../domain/photo-errors";
import {
  MAX_PHOTO_SIZE_BYTES,
  MAX_PHOTOS_PER_VEHICLE,
  type VehiclePhoto,
} from "../domain/vehicle-photo";
import type { VehiclePhotoRepository } from "../repository/vehicle-photo-repository";
import type { VehicleRepository } from "../repository/vehicle-repository";
import {
  deleteVehiclePhoto,
  detectImageMimeType,
  saveVehiclePhoto,
} from "@/lib/storage/vehicle-photo-storage";

export type UploadFileInput = {
  fileName: string;
  buffer: Buffer;
  size: number;
};

export type UploadOutcome =
  | { fileName: string; ok: true; photo: VehiclePhoto }
  | { fileName: string; ok: false; error: string };

/**
 * Business-facing entry point for vehicle photo operations —
 * coordinates the photo repository (metadata) and the storage module
 * (files) so nothing above this layer needs to know both exist.
 * Mirrors VehicleService's shape (constructor-injected repository,
 * ok/fail result type) for consistency with Missions 005/006.
 */
export class VehiclePhotoService {
  constructor(
    private readonly photoRepository: VehiclePhotoRepository,
    private readonly vehicleRepository: VehicleRepository
  ) {}

  async listPhotos(vehicleId: string): Promise<PhotoResult<VehiclePhoto[]>> {
    const vehicle = await this.vehicleRepository.getById(vehicleId);
    if (!vehicle) {
      return failPhoto({
        code: "VEHICLE_NOT_FOUND",
        message: `Vehicle "${vehicleId}" was not found.`,
      });
    }
    return okPhoto(await this.photoRepository.listByVehicleId(vehicleId));
  }

  /** Batched primary-photo lookup for inventory list views. */
  async listPrimaryForVehicles(
    vehicleIds: string[]
  ): Promise<Map<string, VehiclePhoto>> {
    return this.photoRepository.listPrimaryForVehicleIds(vehicleIds);
  }

  /**
   * Uploads one or more files for a vehicle. Each file is validated
   * and saved independently, so one bad file (wrong type, too large)
   * doesn't block the others — the caller gets a per-file outcome
   * list and can show a partial-failure summary instead of an
   * all-or-nothing error.
   */
  async uploadPhotos(
    vehicleId: string,
    files: UploadFileInput[]
  ): Promise<PhotoResult<UploadOutcome[]>> {
    const vehicle = await this.vehicleRepository.getById(vehicleId);
    if (!vehicle) {
      return failPhoto({
        code: "VEHICLE_NOT_FOUND",
        message: `Vehicle "${vehicleId}" was not found.`,
      });
    }

    const existingCount = await this.photoRepository.countByVehicleId(
      vehicleId
    );
    const remainingSlots = Math.max(0, MAX_PHOTOS_PER_VEHICLE - existingCount);

    const outcomes: UploadOutcome[] = [];

    for (const [index, file] of files.entries()) {
      if (index >= remainingSlots) {
        outcomes.push({
          fileName: file.fileName,
          ok: false,
          error: `Vehicle already has the maximum of ${MAX_PHOTOS_PER_VEHICLE} photos.`,
        });
        continue;
      }

      if (file.size === 0) {
        outcomes.push({
          fileName: file.fileName,
          ok: false,
          error: "File is empty.",
        });
        continue;
      }

      if (file.size > MAX_PHOTO_SIZE_BYTES) {
        outcomes.push({
          fileName: file.fileName,
          ok: false,
          error: `File exceeds the ${Math.round(
            MAX_PHOTO_SIZE_BYTES / (1024 * 1024)
          )}MB limit.`,
        });
        continue;
      }

      // The actual, load-bearing type check — reads the file's magic
      // bytes rather than trusting file.type or the extension.
      const detectedType = detectImageMimeType(file.buffer);
      if (!detectedType) {
        outcomes.push({
          fileName: file.fileName,
          ok: false,
          error: "Unsupported file type. Use JPEG, PNG, or WEBP.",
        });
        continue;
      }

      try {
        const saved = await saveVehiclePhoto({
          vehicleId,
          buffer: file.buffer,
          mimeType: detectedType,
        });
        const photo = await this.photoRepository.add({
          vehicleId,
          url: saved.url,
        });
        outcomes.push({ fileName: file.fileName, ok: true, photo });
      } catch {
        outcomes.push({
          fileName: file.fileName,
          ok: false,
          error: "Could not save the file. Please try again.",
        });
      }
    }

    return okPhoto(outcomes);
  }

  /**
   * Mission 014 audit finding: this previously verified only that the
   * photo's own vehicleId matched the vehicleId argument — both of
   * which are ultimately caller-supplied — without ever checking that
   * vehicleId belongs to the caller's business. Business A could
   * delete Business B's photos given a vehicleId/photoId pair,
   * bypassing tenant isolation entirely. Fixed by requiring the
   * vehicle to resolve through the business-scoped vehicleRepository
   * first, exactly like uploadPhotos/reorderPhotos/listPhotos already
   * do — the same pattern to the same effect, not a new one.
   */
  async removePhoto(
    vehicleId: string,
    photoId: string
  ): Promise<PhotoResult<VehiclePhoto[]>> {
    const vehicle = await this.vehicleRepository.getById(vehicleId);
    if (!vehicle) {
      return failPhoto({
        code: "VEHICLE_NOT_FOUND",
        message: `Vehicle "${vehicleId}" was not found.`,
      });
    }

    const photo = await this.photoRepository.getById(photoId);
    if (!photo || photo.vehicleId !== vehicleId) {
      return failPhoto({ code: "PHOTO_NOT_FOUND", message: "Photo was not found." });
    }

    try {
      await deleteVehiclePhoto(photo.url);
    } catch {
      // A storage failure shouldn't block removing the metadata — an
      // orphaned file on disk is recoverable manually later; a photo
      // the user can't remove from the UI at all is not.
    }

    const removed = await this.photoRepository.remove(photoId);
    if (!removed) {
      return failPhoto({ code: "PHOTO_NOT_FOUND", message: "Photo was not found." });
    }

    return okPhoto(await this.photoRepository.listByVehicleId(vehicleId));
  }

  async reorderPhotos(
    vehicleId: string,
    orderedIds: string[]
  ): Promise<PhotoResult<VehiclePhoto[]>> {
    const vehicle = await this.vehicleRepository.getById(vehicleId);
    if (!vehicle) {
      return failPhoto({
        code: "VEHICLE_NOT_FOUND",
        message: `Vehicle "${vehicleId}" was not found.`,
      });
    }
    return okPhoto(await this.photoRepository.reorder(vehicleId, orderedIds));
  }

  /** Same business-scoping fix as removePhoto (Mission 014) — see its comment. */
  async setPrimaryPhoto(
    vehicleId: string,
    photoId: string
  ): Promise<PhotoResult<VehiclePhoto[]>> {
    const vehicle = await this.vehicleRepository.getById(vehicleId);
    if (!vehicle) {
      return failPhoto({
        code: "VEHICLE_NOT_FOUND",
        message: `Vehicle "${vehicleId}" was not found.`,
      });
    }

    const photo = await this.photoRepository.getById(photoId);
    if (!photo || photo.vehicleId !== vehicleId) {
      return failPhoto({ code: "PHOTO_NOT_FOUND", message: "Photo was not found." });
    }
    return okPhoto(
      await this.photoRepository.setPrimary(vehicleId, photoId)
    );
  }
}

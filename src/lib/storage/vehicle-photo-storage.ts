import type { AcceptedPhotoMimeType } from "@/features/inventory/domain/vehicle-photo";
import {
  deletePhoto,
  detectImageMimeType as detectImageMimeTypeGeneric,
  resolvePhotoPath,
  savePhoto,
  type SavedPhotoFile,
} from "./photo-storage";

/**
 * Mission 030 — thin wrapper around the generalized photo-storage.ts
 * core (namespace: "vehicles"). Every exported name, signature, and
 * behavior here is unchanged from before Mission 030: nothing that
 * already depends on this module (VehiclePhotoService, VehicleService,
 * the vehicle photo serving route, and their tests) needed to change.
 * See photo-storage.ts's module doc comment for the full rationale.
 *
 * Root directory for uploaded vehicle photos. Deliberately outside
 * `public/` — files are never served as raw static assets, and every
 * read goes through the validated route handler at
 * `src/app/uploads/vehicles/[vehicleId]/[filename]/route.ts`. Defaults
 * to a project-root `storage/` directory (gitignored); overridable via
 * VEHICLE_PHOTO_STORAGE_DIR so tests can point at an isolated temp
 * directory instead of writing into the real dev storage folder.
 */
const NAMESPACE = "vehicles";
const URL_PREFIX = "uploads/vehicles";

function storageDirOverride(): string | undefined {
  return process.env.VEHICLE_PHOTO_STORAGE_DIR;
}

export function detectImageMimeType(buffer: Buffer): AcceptedPhotoMimeType | null {
  return detectImageMimeTypeGeneric(buffer);
}

export type { SavedPhotoFile };

export async function saveVehiclePhoto(input: {
  vehicleId: string;
  buffer: Buffer;
  mimeType: AcceptedPhotoMimeType;
}): Promise<SavedPhotoFile> {
  return savePhoto({
    namespace: NAMESPACE,
    urlPrefix: URL_PREFIX,
    ownerId: input.vehicleId,
    buffer: input.buffer,
    mimeType: input.mimeType,
    storageDirEnvOverride: storageDirOverride(),
  });
}

export async function deleteVehiclePhoto(url: string): Promise<void> {
  return deletePhoto({
    namespace: NAMESPACE,
    urlPrefix: URL_PREFIX,
    url,
    storageDirEnvOverride: storageDirOverride(),
  });
}

export function resolveVehiclePhotoPath(vehicleId: string, filename: string): string | null {
  return resolvePhotoPath({
    namespace: NAMESPACE,
    ownerId: vehicleId,
    filename,
    storageDirEnvOverride: storageDirOverride(),
  });
}

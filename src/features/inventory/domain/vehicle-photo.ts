/**
 * A single persisted vehicle photo. Storage-provider-agnostic — `url`
 * is whatever the current storage strategy resolves to (a local route
 * path today, potentially a signed cloud URL later); nothing above
 * the storage layer needs to know the difference.
 */
export type VehiclePhoto = {
  id: string;
  vehicleId: string;
  url: string;
  /** 0-based display order within the vehicle's photo set. */
  position: number;
  isPrimary: boolean;
  createdAt: string;
};

/** Basic, deliberately small set of upload constraints for V1. */
export const MAX_PHOTOS_PER_VEHICLE = 10;
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ACCEPTED_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedPhotoMimeType = (typeof ACCEPTED_PHOTO_MIME_TYPES)[number];

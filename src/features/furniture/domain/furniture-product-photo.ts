export type FurnitureProductPhoto = {
  id: string;
  furnitureProductId: string;
  url: string;
  position: number;
  isPrimary: boolean;
  createdAt: string;
};

/** Same limits as vehicle photos (domain/vehicle-photo.ts) — deliberately not shared/imported from there to keep the two verticals free to diverge later without a cross-vertical dependency; the values happen to match today by coincidence of both being reasonable V1 defaults, not because they're the same constant. */
export const MAX_PHOTOS_PER_PRODUCT = 10;
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ACCEPTED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedPhotoMimeType = (typeof ACCEPTED_PHOTO_MIME_TYPES)[number];

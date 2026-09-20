export type FurniturePhotoErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "PHOTO_NOT_FOUND"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_PHOTOS"
  | "EMPTY_FILE"
  | "STORAGE_ERROR"
  | "REPOSITORY_ERROR";

export type FurniturePhotoServiceError = {
  code: FurniturePhotoErrorCode;
  message: string;
  /** Set on upload errors — which staged file (by original name) this refers to. */
  fileName?: string;
};

export type FurniturePhotoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FurniturePhotoServiceError };

export function okPhoto<T>(data: T): FurniturePhotoResult<T> {
  return { ok: true, data };
}

export function failPhoto(error: FurniturePhotoServiceError): FurniturePhotoResult<never> {
  return { ok: false, error };
}

export type PhotoErrorCode =
  | "VEHICLE_NOT_FOUND"
  | "PHOTO_NOT_FOUND"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_PHOTOS"
  | "EMPTY_FILE"
  | "STORAGE_ERROR"
  | "REPOSITORY_ERROR";

export type PhotoServiceError = {
  code: PhotoErrorCode;
  message: string;
  /** Set on upload errors — which staged file (by original name) this refers to. */
  fileName?: string;
};

export type PhotoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PhotoServiceError };

export function okPhoto<T>(data: T): PhotoResult<T> {
  return { ok: true, data };
}

export function failPhoto(error: PhotoServiceError): PhotoResult<never> {
  return { ok: false, error };
}

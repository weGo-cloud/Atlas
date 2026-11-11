export type SocialContentErrorCode =
  | "ITEM_NOT_FOUND"
  | "PHOTO_NOT_FOUND"
  | "POST_NOT_FOUND"
  | "ALREADY_APPROVED"
  | "CAPTION_UNAVAILABLE"
  | "RENDER_FAILED"
  | "VALIDATION_ERROR"
  | "REPOSITORY_ERROR";

export type SocialContentServiceError = { code: SocialContentErrorCode; message: string };
export type SocialContentResult<T> = { ok: true; data: T } | { ok: false; error: SocialContentServiceError };

export function ok<T>(data: T): SocialContentResult<T> {
  return { ok: true, data };
}
export function fail(error: SocialContentServiceError): SocialContentResult<never> {
  return { ok: false, error };
}

export type MarketingErrorCode =
  | "ITEM_NOT_FOUND"
  | "CONTENT_NOT_FOUND"
  | "FORBIDDEN"
  | "AI_NOT_CONFIGURED"
  | "AI_REQUEST_FAILED"
  | "CHANNEL_NOT_CONNECTED"
  | "PUBLISH_FAILED"
  | "VALIDATION_ERROR"
  | "REPOSITORY_ERROR";

export type MarketingServiceError = {
  code: MarketingErrorCode;
  message: string;
};

export type MarketingResult<T> = { ok: true; data: T } | { ok: false; error: MarketingServiceError };

export function ok<T>(data: T): MarketingResult<T> {
  return { ok: true, data };
}

export function fail(error: MarketingServiceError): MarketingResult<never> {
  return { ok: false, error };
}

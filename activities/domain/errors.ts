export type ActivityErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CUSTOMER_NOT_FOUND"
  | "LEAD_NOT_FOUND"
  | "LEAD_CUSTOMER_MISMATCH"
  | "NO_SCHEDULED_FOLLOW_UP"
  | "REPOSITORY_ERROR";

export type ActivityFieldErrors = Partial<Record<"type" | "content" | "customerId" | "leadId", string>>;

export type ActivityServiceError = {
  code: ActivityErrorCode;
  message: string;
  fieldErrors?: ActivityFieldErrors;
};

export type ActivityResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActivityServiceError };

export function okActivity<T>(data: T): ActivityResult<T> {
  return { ok: true, data };
}

export function failActivity(error: ActivityServiceError): ActivityResult<never> {
  return { ok: false, error };
}

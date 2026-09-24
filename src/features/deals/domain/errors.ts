export type DealErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "LEAD_NOT_FOUND"
  | "CUSTOMER_NOT_FOUND"
  | "VEHICLE_NOT_FOUND"
  | "CUSTOMER_LEAD_MISMATCH"
  | "VEHICLE_REQUIRED"
  | "DUPLICATE_ACTIVE_DEAL"
  | "INVALID_STATUS_TRANSITION"
  | "VEHICLE_UNAVAILABLE"
  | "REPOSITORY_ERROR";

export type DealFieldErrors = Partial<
  Record<"leadId" | "vehicleId" | "agreedPrice" | "depositAmount" | "notes", string>
>;

export type DealServiceError = {
  code: DealErrorCode;
  message: string;
  fieldErrors?: DealFieldErrors;
};

export type DealResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DealServiceError };

export function okDeal<T>(data: T): DealResult<T> {
  return { ok: true, data };
}

export function failDeal(error: DealServiceError): DealResult<never> {
  return { ok: false, error };
}

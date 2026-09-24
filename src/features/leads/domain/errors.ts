export type LeadErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CUSTOMER_NOT_FOUND"
  | "VEHICLE_NOT_FOUND"
  /** Mission 030 — Furniture-vertical equivalent of VEHICLE_NOT_FOUND. */
  | "FURNITURE_PRODUCT_NOT_FOUND"
  | "INVALID_STATUS_TRANSITION"
  | "NO_SCHEDULED_FOLLOW_UP"
  | "REPOSITORY_ERROR";

export type LeadFieldErrors = Partial<
  Record<"customerId" | "vehicleId" | "furnitureProductId" | "source" | "notes", string>
>;

export type LeadServiceError = {
  code: LeadErrorCode;
  message: string;
  fieldErrors?: LeadFieldErrors;
};

export type LeadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: LeadServiceError };

export function okLead<T>(data: T): LeadResult<T> {
  return { ok: true, data };
}

export function failLead(error: LeadServiceError): LeadResult<never> {
  return { ok: false, error };
}

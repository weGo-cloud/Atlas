import type { CreateVehicleInput } from "./vehicle-input";

export type VehicleErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "DUPLICATE_STOCK_ID"
  | "INVALID_STATUS_TRANSITION"
  | "REPOSITORY_ERROR"
  | "FORBIDDEN"
  /** Mission 028 — the business's plan-level vehicle limit (entitlements/domain/plan.ts's "vehicles" LimitKey) has been reached. Checked in the action layer (see vehicle-actions.ts's createVehicleAction), not inside VehicleService itself — see that file's doc comment for why. */
  | "LIMIT_EXCEEDED";

export type VehicleFieldErrors = Partial<Record<keyof CreateVehicleInput, string>>;

export type VehicleServiceError = {
  code: VehicleErrorCode;
  message: string;
  /** Present for VALIDATION_ERROR and DUPLICATE_STOCK_ID — maps onto form fields. */
  fieldErrors?: VehicleFieldErrors;
};

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: VehicleServiceError };

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function fail(error: VehicleServiceError): ServiceResult<never> {
  return { ok: false, error };
}

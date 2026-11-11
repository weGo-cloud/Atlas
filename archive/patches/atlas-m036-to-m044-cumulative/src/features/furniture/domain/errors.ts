import type { CreateFurnitureProductInput } from "./furniture-product-input";

export type FurnitureErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INVALID_STATUS_TRANSITION"
  | "REPOSITORY_ERROR"
  | "FORBIDDEN"
  /** Mission 030 — the business's plan-level "furniture_products" limit (entitlements/domain/plan.ts) has been reached. */
  | "LIMIT_EXCEEDED";

export type FurnitureFieldErrors = Partial<Record<keyof CreateFurnitureProductInput, string>>;

export type FurnitureServiceError = {
  code: FurnitureErrorCode;
  message: string;
  fieldErrors?: FurnitureFieldErrors;
};

export type FurnitureResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FurnitureServiceError };

export function ok<T>(data: T): FurnitureResult<T> {
  return { ok: true, data };
}

export function fail(error: FurnitureServiceError): FurnitureResult<never> {
  return { ok: false, error };
}

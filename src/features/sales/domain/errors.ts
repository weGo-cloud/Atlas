export type SaleErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "DEAL_NOT_FOUND"
  | "DEAL_NOT_COMPLETED"
  | "DUPLICATE_SALE"
  | "VEHICLE_ALREADY_SOLD"
  | "VEHICLE_NOT_FINALIZED"
  | "FORBIDDEN"
  | "REPOSITORY_ERROR";

export type SaleFieldErrors = Partial<Record<"dealId" | "saleAmount" | "notes", string>>;

export type SaleServiceError = {
  code: SaleErrorCode;
  message: string;
  fieldErrors?: SaleFieldErrors;
};

export type SaleResult<T> = { ok: true; data: T } | { ok: false; error: SaleServiceError };

export function okSale<T>(data: T): SaleResult<T> {
  return { ok: true, data };
}

export function failSale(error: SaleServiceError): SaleResult<never> {
  return { ok: false, error };
}

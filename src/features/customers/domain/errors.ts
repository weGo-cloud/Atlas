import type { CreateCustomerInput } from "./customer-input";

export type CustomerErrorCode = "NOT_FOUND" | "VALIDATION_ERROR" | "REPOSITORY_ERROR";

export type CustomerFieldErrors = Partial<Record<keyof CreateCustomerInput, string>>;

export type CustomerServiceError = {
  code: CustomerErrorCode;
  message: string;
  fieldErrors?: CustomerFieldErrors;
};

export type CustomerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CustomerServiceError };

export function okCustomer<T>(data: T): CustomerResult<T> {
  return { ok: true, data };
}

export function failCustomer(error: CustomerServiceError): CustomerResult<never> {
  return { ok: false, error };
}

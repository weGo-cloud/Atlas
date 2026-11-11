export type PaymentErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CUSTOMER_NOT_FOUND"
  | "DEAL_NOT_FOUND"
  | "DUPLICATE_REFERENCE"
  | "OVERPAYMENT"
  | "INVALID_STATE"
  | "NOT_IN_PLAN"
  | "NOT_CONNECTED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "FORBIDDEN"
  | "REPOSITORY_ERROR";

export type PaymentFieldErrors = Partial<
  Record<"customerId" | "dealId" | "amount" | "method" | "kind" | "reference" | "payerPhone" | "paidAt" | "notes" | "phone" | "reason", string>
>;

export type PaymentServiceError = { code: PaymentErrorCode; message: string; fieldErrors?: PaymentFieldErrors };
export type PaymentResult<T> = { ok: true; data: T } | { ok: false; error: PaymentServiceError };

export const okPayment = <T,>(data: T): PaymentResult<T> => ({ ok: true, data });
export const failPayment = (error: PaymentServiceError): PaymentResult<never> => ({ ok: false, error });

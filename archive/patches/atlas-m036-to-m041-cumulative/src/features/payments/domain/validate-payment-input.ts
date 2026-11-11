import { isPaymentKind, isPaymentMethod, type PaymentKind, type PaymentMethod } from "./payment";
import type { PaymentFieldErrors } from "./errors";
import { normalizeKenyanPhone } from "../mpesa/phone";

export const MAX_PAYMENT_AMOUNT = 1_000_000_000;
export const MPESA_RECEIPT = /^[A-Z0-9]{10}$/;

export type ManualPaymentInput = {
  customerId: string;
  dealId?: string | null;
  amount: unknown;
  method: unknown;
  kind: unknown;
  reference?: unknown;
  payerPhone?: unknown;
  payerName?: unknown;
  itemLabel?: unknown;
  paidAt?: unknown;
  notes?: unknown;
};

export type ValidManualPayment = {
  customerId: string;
  dealId: string | null;
  amount: number;
  method: PaymentMethod;
  kind: PaymentKind;
  reference: string | null;
  payerPhone: string | null;
  payerName: string | null;
  itemLabel: string | null;
  paidAt: string;
  notes: string;
};

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed === "" ? null : trimmed;
};

/** Parses a whole-shilling amount from a number or a string like "1,250" / "KES 1250". Rejects decimals, zero and negatives. */
export function parseKesAmount(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  const cleaned = raw.replace(/kes|ksh|\s|,/gi, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAYMENT_AMOUNT ? n : null;
}

/**
 * Method-aware validation of a hand-recorded payment. The rules mirror how each method is actually evidenced:
 * an M-Pesa receipt is always a 10-character code, a bank transfer or cheque needs its reference/number, cash needs
 * nothing. The reference is normalized (upper-cased for M-Pesa) because uniqueness per (business, method, reference)
 * is what stops the same receipt being recorded twice.
 */
export function validateManualPayment(
  input: ManualPaymentInput,
  now: Date = new Date()
): { ok: true; value: ValidManualPayment } | { ok: false; fieldErrors: PaymentFieldErrors } {
  const errors: PaymentFieldErrors = {};

  const amount = parseKesAmount(input.amount);
  if (amount === null) errors.amount = "Enter a whole-shilling amount greater than 0.";

  const method = isPaymentMethod(input.method) ? input.method : null;
  if (!method) errors.method = "Choose how the customer paid.";
  const kind = isPaymentKind(input.kind) ? input.kind : null;
  if (!kind) errors.kind = "Choose the payment type.";

  let reference = text(input.reference, 60);
  if (method === "mpesa") {
    reference = reference ? reference.toUpperCase().replace(/\s/g, "") : null;
    if (!reference || !MPESA_RECEIPT.test(reference)) errors.reference = "Enter the 10-character M-Pesa receipt code (e.g. SJK4X9ABCD).";
  } else if (method === "airtel_money" && (!reference || reference.length < 6)) {
    errors.reference = "Enter the Airtel Money transaction ID.";
  } else if (method === "bank_transfer" && (!reference || reference.length < 4)) {
    errors.reference = "Enter the bank transfer reference.";
  } else if (method === "cheque" && (!reference || reference.length < 3)) {
    errors.reference = "Enter the cheque number.";
  }

  let payerPhone: string | null = null;
  const phoneRaw = text(input.payerPhone, 30);
  if (phoneRaw) {
    payerPhone = normalizeKenyanPhone(phoneRaw);
    if (!payerPhone) errors.payerPhone = "Enter a valid Kenyan phone number.";
  }

  let paidAt = now.toISOString();
  if (input.paidAt !== undefined && input.paidAt !== null && String(input.paidAt).trim() !== "") {
    const parsed = new Date(String(input.paidAt));
    if (Number.isNaN(parsed.getTime())) errors.paidAt = "Enter a valid date.";
    else if (parsed.getTime() > now.getTime() + 5 * 60_000) errors.paidAt = "The payment date can't be in the future.";
    else if (parsed.getTime() < now.getTime() - 10 * 365 * 86_400_000) errors.paidAt = "That date is too far in the past.";
    else paidAt = parsed.toISOString();
  }

  if (Object.keys(errors).length > 0 || amount === null || !method || !kind) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      customerId: input.customerId,
      dealId: input.dealId ?? null,
      amount,
      method,
      kind,
      reference,
      payerPhone,
      payerName: text(input.payerName, 100),
      itemLabel: text(input.itemLabel, 150),
      paidAt,
      notes: text(input.notes, 500) ?? "",
    },
  };
}

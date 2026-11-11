/**
 * Mission 040 — the customer payments domain.
 *
 * A Payment is one money movement against a customer, optionally tied to a Deal. It is append-mostly: a confirmed
 * payment is never edited or deleted, only REVERSED (with who/why), and refunds are their own rows — so the ledger
 * always explains the balance. Whole shillings (KES) only.
 */
export const PAYMENT_METHODS = ["cash", "mpesa", "airtel_money", "bank_transfer", "cheque", "card", "financing", "trade_in", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  airtel_money: "Airtel Money",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  card: "Card",
  financing: "Financing / hire purchase",
  trade_in: "Trade-in credit",
  other: "Other",
};

export const PAYMENT_KINDS = ["deposit", "installment", "balance", "full_payment", "refund"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  deposit: "Deposit",
  installment: "Instalment",
  balance: "Balance",
  full_payment: "Full payment",
  refund: "Refund",
};

/**
 * pending   — money not yet confirmed (an M-Pesa STK prompt awaiting the customer, or a cheque not yet cleared).
 * confirmed — counted toward the balance.
 * failed    — the attempt did not succeed (wrong PIN, insufficient funds, cheque bounced...). Kept for history.
 * cancelled — abandoned (customer cancelled the prompt, or a duplicate of an already-recorded receipt).
 * reversed  — was confirmed, later reversed by an owner with a reason. No longer counted.
 */
export const PAYMENT_STATUSES = ["pending", "confirmed", "failed", "cancelled", "reversed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  failed: "Failed",
  cancelled: "Cancelled",
  reversed: "Reversed",
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}
export function isPaymentKind(value: unknown): value is PaymentKind {
  return typeof value === "string" && (PAYMENT_KINDS as readonly string[]).includes(value);
}

export type Payment = {
  id: string;
  businessId: string;
  customerId: string;
  dealId: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  kind: PaymentKind;
  status: PaymentStatus;
  reference: string | null;
  payerPhone: string | null;
  payerName: string | null;
  itemLabel: string | null;
  paidAt: string;
  notes: string;
  recordedByUserId: string | null;
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  failureReason: string | null;
  /** provider = confirmed by Safaricom; manual = typed in by staff (unverified evidence). */
  verification: "provider" | "manual";
  reversedAt: string | null;
  reversedReason: string | null;
  reversedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Mission 042 — furniture orders.
 *
 * A furniture shop's equivalent of a vehicle deal + sale: one or more lines (product x quantity), a total, and a lifecycle
 *   draft -> confirmed -> fulfilled        (or cancelled from draft/confirmed)
 * Confirming COMMITS STOCK atomically (never oversells); cancelling a confirmed order restores it, but only once its payments
 * have been refunded/reversed, so money can never be orphaned by a cancellation. Payments are tracked in the payments ledger.
 * Whole shillings only. The database enforces the same rules (migration 0025 triggers) as a backstop.
 */
export const ORDER_STATUSES = ["draft", "confirmed", "fulfilled", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export type OrderLine = {
  id: string;
  orderId: string;
  productId: string | null;
  name: string;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type FurnitureOrder = {
  id: string;
  businessId: string;
  reference: string;
  customerId: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  deliveryAddress: string | null;
  deliveryDate: string | null;
  notes: string;
  createdByUserId: string | null;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FurnitureOrderWithLines = FurnitureOrder & { lines: OrderLine[]; customerName: string | null };

export type OrderErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CUSTOMER_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "INVALID_STATE"
  | "HAS_PAYMENTS";

export type OrderFieldErrors = Partial<Record<"customerId" | "lines" | "deliveryFee" | "discount" | "deliveryAddress" | "deliveryDate" | "notes" | "reason", string>>;
export type OrderServiceError = { code: OrderErrorCode; message: string; fieldErrors?: OrderFieldErrors };
export type OrderResult<T> = { ok: true; data: T } | { ok: false; error: OrderServiceError };
export const okOrder = <T,>(data: T): OrderResult<T> => ({ ok: true, data });
export const failOrder = (error: OrderServiceError): OrderResult<never> => ({ ok: false, error });

export function computeOrderTotals(lines: ReadonlyArray<{ unitPrice: number; quantity: number }>, deliveryFee: number, discount: number): { subtotal: number; total: number } {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return { subtotal, total: subtotal + deliveryFee - discount };
}

import type { OrderFieldErrors } from "./order";

export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 999;
const MAX_MONEY = 1_000_000_000;

export type NewOrderInput = {
  customerId: unknown;
  lines: unknown;
  deliveryFee?: unknown;
  discount?: unknown;
  deliveryAddress?: unknown;
  deliveryDate?: unknown;
  notes?: unknown;
};

export type ValidNewOrder = {
  customerId: string;
  /** Duplicate products are merged (quantities summed) so one product appears once. */
  lines: Array<{ productId: string; quantity: number }>;
  deliveryFee: number;
  discount: number;
  deliveryAddress: string | null;
  deliveryDate: string | null;
  notes: string;
};

const wholeMoney = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[,\s]|kes|ksh/gi, "")) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_MONEY ? n : null;
};
const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

export function validateNewOrder(input: NewOrderInput): { ok: true; value: ValidNewOrder } | { ok: false; fieldErrors: OrderFieldErrors } {
  const errors: OrderFieldErrors = {};
  const customerId = typeof input.customerId === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(input.customerId) ? input.customerId : null;
  if (!customerId) errors.customerId = "Choose a customer.";

  const merged = new Map<string, number>();
  if (!Array.isArray(input.lines) || input.lines.length === 0) errors.lines = "Add at least one item.";
  else if (input.lines.length > MAX_ORDER_LINES) errors.lines = `An order can have at most ${MAX_ORDER_LINES} items.`;
  else {
    for (const raw of input.lines) {
      const line = raw as { productId?: unknown; quantity?: unknown };
      const qty = typeof line.quantity === "number" ? line.quantity : typeof line.quantity === "string" ? Number(line.quantity) : NaN;
      if (typeof line.productId !== "string" || !/^[A-Za-z0-9_-]{3,64}$/.test(line.productId) || !Number.isInteger(qty) || qty < 1 || qty > MAX_LINE_QUANTITY) {
        errors.lines = `Each item needs a product and a quantity from 1 to ${MAX_LINE_QUANTITY}.`;
        break;
      }
      merged.set(line.productId, (merged.get(line.productId) ?? 0) + qty);
    }
    if ([...merged.values()].some((q) => q > MAX_LINE_QUANTITY)) errors.lines = `Quantity per product is limited to ${MAX_LINE_QUANTITY}.`;
  }

  const deliveryFee = wholeMoney(input.deliveryFee);
  if (deliveryFee === null) errors.deliveryFee = "Enter a whole-shilling amount (or leave blank).";
  const discount = wholeMoney(input.discount);
  if (discount === null) errors.discount = "Enter a whole-shilling amount (or leave blank).";

  let deliveryDate: string | null = null;
  if (typeof input.deliveryDate === "string" && input.deliveryDate.trim()) {
    const d = new Date(input.deliveryDate);
    if (Number.isNaN(d.getTime())) errors.deliveryDate = "Enter a valid date.";
    else deliveryDate = d.toISOString();
  }

  if (Object.keys(errors).length > 0 || !customerId || deliveryFee === null || discount === null) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      customerId,
      lines: [...merged].map(([productId, quantity]) => ({ productId, quantity })),
      deliveryFee,
      discount,
      deliveryAddress: text(input.deliveryAddress, 300),
      deliveryDate,
      notes: text(input.notes, 500) ?? "",
    },
  };
}

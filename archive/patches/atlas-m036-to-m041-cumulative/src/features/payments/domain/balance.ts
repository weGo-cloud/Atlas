import type { Payment } from "./payment";

export type BalanceStatus = "unpaid" | "partial" | "paid" | "overpaid";

export type PaymentSummary = {
  agreedPrice: number;
  /** Confirmed money received (excluding refunds). */
  received: number;
  /** Confirmed refunds paid back out. */
  refunded: number;
  /** received - refunded: what actually counts toward the price. */
  netPaid: number;
  /** Awaiting confirmation (STK prompts out, uncleared cheques). Not counted in netPaid. */
  pending: number;
  /** agreedPrice - netPaid. Negative when overpaid. */
  balance: number;
  /** What can still be collected without exceeding the price: balance minus pending, never below 0. */
  collectable: number;
  status: BalanceStatus;
};

/**
 * Pure: the balance of one deal from its payment rows. Only CONFIRMED rows count; pending ones are shown separately
 * and reserve collectable room so two simultaneous requests can't together exceed the price. Failed, cancelled and
 * reversed rows never count.
 */
export function computeBalance(agreedPrice: number, payments: readonly Pick<Payment, "amount" | "kind" | "status">[]): PaymentSummary {
  let received = 0;
  let refunded = 0;
  let pending = 0;
  for (const payment of payments) {
    if (payment.status === "confirmed") {
      if (payment.kind === "refund") refunded += payment.amount;
      else received += payment.amount;
    } else if (payment.status === "pending" && payment.kind !== "refund") {
      pending += payment.amount;
    }
  }
  const netPaid = received - refunded;
  const balance = agreedPrice - netPaid;
  const status: BalanceStatus = netPaid <= 0 ? "unpaid" : netPaid < agreedPrice ? "partial" : netPaid === agreedPrice ? "paid" : "overpaid";
  return { agreedPrice, received, refunded, netPaid, pending, balance, collectable: Math.max(0, balance - pending), status };
}

export const BALANCE_STATUS_LABEL: Record<BalanceStatus, string> = {
  unpaid: "Unpaid",
  partial: "Part paid",
  paid: "Paid in full",
  overpaid: "Overpaid",
};

import { randomUUID } from "node:crypto";

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { customers, deals, paymentEvents, payments, type PaymentRow } from "@/lib/db/schema";
import { computeBalance } from "../domain/balance";
import type { PaymentErrorCode } from "../domain/errors";
import type { Payment, PaymentKind, PaymentMethod, PaymentStatus } from "../domain/payment";

export type NewPayment = {
  customerId: string;
  dealId: string | null;
  amount: number;
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
  /** provider = only ever confirmable through Safaricom; manual = typed in by staff. Locked after insert (DB trigger). */
  verification: "provider" | "manual";
};

export type GuardedInsertResult = { ok: true; payment: Payment } | { ok: false; code: PaymentErrorCode; message: string };

export type PaymentPatch = Partial<{
  status: PaymentStatus;
  reference: string | null;
  failureReason: string | null;
  payerPhone: string | null;
  payerName: string | null;
  paidAt: string;
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  reversedAt: string | null;
  reversedReason: string | null;
  reversedByUserId: string | null;
}>;

export type DealContext = { id: string; customerId: string; agreedPrice: number; status: string; vehicleLabel: string | null };

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    businessId: row.businessId,
    customerId: row.customerId,
    dealId: row.dealId,
    amount: row.amount,
    currency: row.currency,
    method: row.method as PaymentMethod,
    kind: row.kind as PaymentKind,
    status: row.status as PaymentStatus,
    reference: row.reference,
    payerPhone: row.payerPhone,
    payerName: row.payerName,
    itemLabel: row.itemLabel,
    paidAt: row.paidAt,
    notes: row.notes,
    recordedByUserId: row.recordedByUserId,
    checkoutRequestId: row.checkoutRequestId,
    merchantRequestId: row.merchantRequestId,
    failureReason: row.failureReason,
    verification: row.verification === "provider" ? "provider" : "manual",
    reversedAt: row.reversedAt,
    reversedReason: row.reversedReason,
    reversedByUserId: row.reversedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const isUniqueViolation = (error: unknown) => error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
export { isUniqueViolation };

/**
 * Mission 040 — business-scoped access to the payments ledger. Every query carries `business_id`, so a guessed id from
 * another business can never be read or changed. There is deliberately no delete and no general update: the only writes
 * are an insert (guarded against overpayment inside one immediate transaction) and `transition`, a compare-and-set on the
 * current status, so two racing events (a callback and a manual refresh) can never both "win".
 */
export class DatabasePaymentRepository {
  constructor(private readonly businessId: string) {}

  async getById(id: string): Promise<Payment | null> {
    const rows = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.businessId, this.businessId))).limit(1);
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async listForDeal(dealId: string): Promise<Payment[]> {
    const rows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.dealId, dealId), eq(payments.businessId, this.businessId)))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt));
    return rows.map(toPayment);
  }

  async listRecent(options: { limit: number; since?: string; status?: PaymentStatus; method?: PaymentMethod }): Promise<Array<Payment & { customerName: string | null }>> {
    const conditions = [eq(payments.businessId, this.businessId)];
    if (options.since) conditions.push(gte(payments.paidAt, options.since));
    if (options.status) conditions.push(eq(payments.status, options.status));
    if (options.method) conditions.push(eq(payments.method, options.method));
    const rows = await db
      .select({ payment: payments, customerName: customers.name })
      .from(payments)
      .leftJoin(customers, eq(customers.id, payments.customerId))
      .where(and(...conditions))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt))
      .limit(Math.min(Math.max(options.limit, 1), 200));
    return rows.map((r) => ({ ...toPayment(r.payment), customerName: r.customerName }));
  }

  async findByCheckoutRequestId(checkoutRequestId: string): Promise<Payment | null> {
    const rows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.checkoutRequestId, checkoutRequestId), eq(payments.businessId, this.businessId)))
      .limit(1);
    return rows[0] ? toPayment(rows[0]) : null;
  }

  /** A pending STK prompt for the same deal and phone sent recently: used to stop a double-click sending two prompts. */
  async findRecentPendingStk(dealId: string, phone: string, sinceIso: string): Promise<Payment | null> {
    const rows = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.businessId, this.businessId),
          eq(payments.dealId, dealId),
          eq(payments.payerPhone, phone),
          eq(payments.method, "mpesa"),
          eq(payments.status, "pending"),
          gte(payments.createdAt, sinceIso.replace("T", " ").slice(0, 19))
        )
      )
      .limit(1);
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async getDealContext(dealId: string): Promise<DealContext | null> {
    const rows = await db
      .select({ id: deals.id, customerId: deals.customerId, agreedPrice: deals.agreedPrice, status: deals.status, vehicleLabel: deals.vehicleLabel })
      .from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.businessId, this.businessId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getCustomer(customerId: string): Promise<{ id: string; name: string; phone: string | null } | null> {
    const rows = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.businessId, this.businessId)))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Inserts a payment. For a deal-linked payment the whole check-then-insert runs inside ONE immediate transaction:
   * the deal must be this business's and this customer's, must not be cancelled, and the amount must not exceed what is
   * still collectable (confirmed + pending already count), so concurrent requests can't together overpay a deal.
   */
  async insertGuarded(input: NewPayment): Promise<GuardedInsertResult> {
    const businessId = this.businessId;
    try {
      return db.transaction(
        (tx): GuardedInsertResult => {
          const customer = tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.businessId, businessId))).get();
          if (!customer) return { ok: false, code: "CUSTOMER_NOT_FOUND", message: "Customer not found." };

          if (input.dealId) {
            const deal = tx
              .select({ id: deals.id, customerId: deals.customerId, agreedPrice: deals.agreedPrice, status: deals.status })
              .from(deals)
              .where(and(eq(deals.id, input.dealId), eq(deals.businessId, businessId)))
              .get();
            if (!deal) return { ok: false, code: "DEAL_NOT_FOUND", message: "Deal not found." };
            if (deal.customerId !== input.customerId) return { ok: false, code: "VALIDATION_ERROR", message: "That deal belongs to a different customer." };
            if (deal.status === "cancelled") return { ok: false, code: "INVALID_STATE", message: "This deal is cancelled, so it can't take payments." };

            const rows = tx
              .select({ amount: payments.amount, kind: payments.kind, status: payments.status })
              .from(payments)
              .where(and(eq(payments.dealId, input.dealId), eq(payments.businessId, businessId)))
              .all() as Array<{ amount: number; kind: PaymentKind; status: PaymentStatus }>;
            const summary = computeBalance(deal.agreedPrice, rows);
            if (input.kind === "refund") {
              if (input.amount > summary.netPaid) return { ok: false, code: "OVERPAYMENT", message: `A refund can't exceed the KES ${summary.netPaid.toLocaleString("en-KE")} paid so far.` };
            } else if (input.amount > summary.collectable) {
              return {
                ok: false,
                code: "OVERPAYMENT",
                message:
                  summary.collectable === 0
                    ? "This deal has nothing left to collect (it is paid, or the balance is covered by pending payments)."
                    : `That is more than the KES ${summary.collectable.toLocaleString("en-KE")} still to collect on this deal.`,
              };
            }
          }

          const row = tx
            .insert(payments)
            .values({
              id: `pay_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
              businessId,
              customerId: input.customerId,
              dealId: input.dealId,
              amount: input.amount,
              method: input.method,
              kind: input.kind,
              status: input.status,
              reference: input.reference,
              payerPhone: input.payerPhone,
              payerName: input.payerName,
              itemLabel: input.itemLabel,
              paidAt: input.paidAt,
              notes: input.notes,
              recordedByUserId: input.recordedByUserId,
              verification: input.verification,
            })
            .returning()
            .get();
          return { ok: true, payment: toPayment(row) };
        },
        { behavior: "immediate" }
      );
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, code: "DUPLICATE_REFERENCE", message: "That receipt/reference has already been recorded for this method." };
      throw error;
    }
  }

  /** Compare-and-set: applies `patch` only if the payment is currently in one of `from`. Null = it already moved on (or isn't ours). */
  async transition(id: string, from: PaymentStatus[], patch: PaymentPatch): Promise<Payment | null> {
    const rows = await db
      .update(payments)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(and(eq(payments.id, id), eq(payments.businessId, this.businessId), inArray(payments.status, from)))
      .returning();
    return rows[0] ? toPayment(rows[0]) : null;
  }

  /** Adds a missing reference to a confirmed payment, once. Never overwrites an existing reference. */
  async attachReference(id: string, reference: string): Promise<Payment | null> {
    const rows = await db
      .update(payments)
      .set({ reference, updatedAt: new Date().toISOString() })
      .where(and(eq(payments.id, id), eq(payments.businessId, this.businessId), eq(payments.status, "confirmed"), isNull(payments.reference)))
      .returning();
    return rows[0] ? toPayment(rows[0]) : null;
  }

  /** Confirmed, non-refund money received by method since `since`, and confirmed refunds, for the payments report. */
  async totalsByMethod(since: string): Promise<Array<{ method: PaymentMethod; received: number; refunded: number; count: number; unverifiedManual: number }>> {
    const rows = db
      .all<{ method: string; received: number; refunded: number; count: number; unverified: number }>(sql`
        SELECT method,
               COALESCE(SUM(CASE WHEN kind != 'refund' THEN amount ELSE 0 END), 0) AS received,
               COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END), 0) AS refunded,
               COUNT(*) AS count,
               COALESCE(SUM(CASE WHEN kind != 'refund' AND verification = 'manual' AND method IN ('mpesa','airtel_money') THEN amount ELSE 0 END), 0) AS unverified
          FROM payments
         WHERE business_id = ${this.businessId} AND status = 'confirmed' AND paid_at >= ${since}
         GROUP BY method
         ORDER BY received DESC`);
    return rows.map((r) => ({ method: r.method as PaymentMethod, received: r.received, refunded: r.refunded, count: r.count, unverifiedManual: r.unverified }));
  }

  /** Sum of STK amounts requested in the window (any outcome except failed-before-send), for blast-radius limits. */
  async stkVolumeSince(sinceIso: string): Promise<number> {
    const rows = db.all<{ total: number }>(sql`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments
       WHERE business_id = ${this.businessId} AND method = 'mpesa' AND checkout_request_id IS NOT NULL AND created_at >= ${sinceIso.replace("T", " ").slice(0, 19)}`);
    return rows[0]?.total ?? 0;
  }

  async recordEvent(event: { paymentId?: string | null; actorUserId?: string | null; action: string; detail?: Record<string, unknown> }): Promise<void> {
    await db.insert(paymentEvents).values({
      id: `pev_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      businessId: this.businessId,
      paymentId: event.paymentId ?? null,
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      detail: JSON.stringify(event.detail ?? {}).slice(0, 2000),
    });
  }

  async listEvents(paymentId: string): Promise<Array<{ action: string; actorUserId: string | null; detail: string; createdAt: string }>> {
    return db
      .select({ action: paymentEvents.action, actorUserId: paymentEvents.actorUserId, detail: paymentEvents.detail, createdAt: paymentEvents.createdAt })
      .from(paymentEvents)
      .where(and(eq(paymentEvents.paymentId, paymentId), eq(paymentEvents.businessId, this.businessId)))
      .orderBy(desc(paymentEvents.createdAt));
  }
}

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { c2bPayments, type C2bPaymentRow } from "@/lib/db/schema";
import type { C2bNotification } from "../mpesa/c2b";
import { isUniqueViolation } from "./database-payment-repository";

export type C2bInboxItem = {
  id: string;
  transId: string;
  amountKes: number | null;
  amountRaw: string;
  billRef: string | null;
  payerPhone: string | null;
  payerName: string | null;
  paidAt: string;
  status: "unallocated" | "allocated" | "ignored";
  allocatedPaymentId: string | null;
  createdAt: string;
};

const toItem = (r: C2bPaymentRow): C2bInboxItem => ({
  id: r.id,
  transId: r.transId,
  amountKes: r.amountKes,
  amountRaw: r.amountRaw,
  billRef: r.billRef,
  payerPhone: r.payerPhone,
  payerName: r.payerName,
  paidAt: r.paidAt,
  status: r.status as C2bInboxItem["status"],
  allocatedPaymentId: r.allocatedPaymentId,
  createdAt: r.createdAt,
});

/** Mission 043 — the business's inbox of M-Pesa notifications for payments made straight to its till/paybill. Business-scoped like every repository. */
export class DatabaseC2bRepository {
  constructor(private readonly businessId: string) {}

  /** Stores a notification once. Safaricom retries, so a repeated TransID is a harmless no-op (returns false). */
  async insertIfNew(n: C2bNotification): Promise<boolean> {
    try {
      await db.insert(c2bPayments).values({
        id: `c2b_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        businessId: this.businessId,
        transId: n.transId,
        amountKes: n.amountKes,
        amountRaw: n.amountRaw,
        billRef: n.billRef,
        payerPhone: n.phone,
        payerName: n.name,
        paidAt: n.paidAt,
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async get(id: string): Promise<C2bInboxItem | null> {
    const rows = await db.select().from(c2bPayments).where(and(eq(c2bPayments.id, id), eq(c2bPayments.businessId, this.businessId))).limit(1);
    return rows[0] ? toItem(rows[0]) : null;
  }

  async listUnallocated(limit = 100): Promise<C2bInboxItem[]> {
    const rows = await db.select().from(c2bPayments).where(and(eq(c2bPayments.businessId, this.businessId), eq(c2bPayments.status, "unallocated"))).orderBy(asc(c2bPayments.paidAt)).limit(limit);
    return rows.map(toItem);
  }

  async listRecent(limit = 20): Promise<C2bInboxItem[]> {
    const rows = await db.select().from(c2bPayments).where(eq(c2bPayments.businessId, this.businessId)).orderBy(desc(c2bPayments.paidAt)).limit(limit);
    return rows.map(toItem);
  }

  /** Compare-and-set claim: only ONE caller can move an unallocated notification forward. */
  async claim(id: string, to: "allocated" | "ignored", nowIso: string): Promise<C2bInboxItem | null> {
    const rows = await db
      .update(c2bPayments)
      .set({ status: to, allocatedAt: nowIso })
      .where(and(eq(c2bPayments.id, id), eq(c2bPayments.businessId, this.businessId), eq(c2bPayments.status, "unallocated")))
      .returning();
    return rows[0] ? toItem(rows[0]) : null;
  }

  async attachPayment(id: string, paymentId: string): Promise<void> {
    await db.update(c2bPayments).set({ allocatedPaymentId: paymentId }).where(and(eq(c2bPayments.id, id), eq(c2bPayments.businessId, this.businessId)));
  }

  /** Gives a claim back when the payment it was for could not be created (the database only allows this while no payment is attached). */
  async release(id: string): Promise<void> {
    await db.update(c2bPayments).set({ status: "unallocated", allocatedAt: null }).where(and(eq(c2bPayments.id, id), eq(c2bPayments.businessId, this.businessId), eq(c2bPayments.status, "allocated")));
  }
}

import { randomUUID } from "node:crypto";

import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { isPaidPlan, listPlans, type SubscriptionPlan } from "@/features/entitlements/domain/plan";
import { db } from "@/lib/db/client";
import { billingInvoices, subscriptions, type BillingInvoiceRow } from "@/lib/db/schema";
import { isUniqueViolation } from "@/features/payments/repository/database-payment-repository";
import type { BillingInvoice, InvoiceKind, InvoiceStatus, PaymentState } from "../domain/billing";

export function toInvoice(row: BillingInvoiceRow): BillingInvoice {
  return {
    id: row.id,
    businessId: row.businessId,
    plan: row.plan as SubscriptionPlan,
    amount: row.amount,
    currency: row.currency,
    kind: row.kind as InvoiceKind,
    status: row.status as InvoiceStatus,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    dueAt: row.dueAt,
    attempts: row.attempts,
    lastAttemptAt: row.lastAttemptAt,
    checkoutRequestId: row.checkoutRequestId,
    payerPhone: row.payerPhone,
    paymentState: row.paymentState as PaymentState,
    receipt: row.receipt,
    failureReason: row.failureReason,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}

export type NewInvoice = { businessId: string; plan: SubscriptionPlan; amount: number; kind: InvoiceKind; periodStart: string; periodEnd: string; dueAt: string };
export type SettleResult = { ok: true; invoice: BillingInvoice } | { ok: false; reason: "not_open" | "duplicate_receipt" | "no_subscription" };

/**
 * Mission 041 — platform-level (cross-business) access to Atlas's own invoices. Unlike the per-business repositories this is
 * used by the billing cycle and the M-Pesa callback, so every method that touches one business takes its id explicitly.
 * Money-moving writes are single immediate transactions or compare-and-set updates.
 */
export class DatabaseBillingRepository {
  async getOpenInvoice(businessId: string): Promise<BillingInvoice | null> {
    const rows = await db.select().from(billingInvoices).where(and(eq(billingInvoices.businessId, businessId), eq(billingInvoices.status, "open"))).limit(1);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async getLatestPaid(businessId: string): Promise<BillingInvoice | null> {
    const rows = await db.select().from(billingInvoices).where(and(eq(billingInvoices.businessId, businessId), eq(billingInvoices.status, "paid"))).orderBy(sql`${billingInvoices.paidAt} desc`).limit(1);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async findByCheckoutRequestId(checkoutRequestId: string): Promise<BillingInvoice | null> {
    const rows = await db.select().from(billingInvoices).where(eq(billingInvoices.checkoutRequestId, checkoutRequestId)).limit(1);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async hasPaidInvoiceFrom(businessId: string, periodStartIso: string): Promise<boolean> {
    const rows = await db.select({ id: billingInvoices.id }).from(billingInvoices).where(and(eq(billingInvoices.businessId, businessId), eq(billingInvoices.status, "paid"), sql`${billingInvoices.periodEnd} > ${periodStartIso}`)).limit(1);
    return rows.length > 0;
  }

  /** Creates an invoice. `replaceOpen` voids any open one first (an upgrade supersedes a pending renewal). Returns null if an open invoice already exists and wasn't replaced. */
  async createInvoice(input: NewInvoice, replaceOpen: boolean): Promise<BillingInvoice | null> {
    try {
      return db.transaction(
        (tx) => {
          if (replaceOpen) tx.update(billingInvoices).set({ status: "void", updatedAt: new Date().toISOString() }).where(and(eq(billingInvoices.businessId, input.businessId), eq(billingInvoices.status, "open"))).run();
          const row = tx
            .insert(billingInvoices)
            .values({ id: `inv_${randomUUID().replace(/-/g, "").slice(0, 16)}`, businessId: input.businessId, plan: input.plan, amount: input.amount, kind: input.kind, periodStart: input.periodStart, periodEnd: input.periodEnd, dueAt: input.dueAt })
            .returning()
            .get();
          return toInvoice(row);
        },
        { behavior: "immediate" }
      );
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /** Claims prompt number `expectedAttempts` for an open invoice (compare-and-set). Only the single winner may send an M-Pesa prompt. */
  async claimAttempt(invoiceId: string, expectedAttempts: number, nowIso: string): Promise<boolean> {
    const rows = await db
      .update(billingInvoices)
      .set({ attempts: expectedAttempts + 1, lastAttemptAt: nowIso, paymentState: "pending", failureReason: null, updatedAt: nowIso })
      .where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.status, "open"), eq(billingInvoices.attempts, expectedAttempts)))
      .returning({ id: billingInvoices.id });
    return rows.length > 0;
  }

  async attachPrompt(invoiceId: string, ids: { checkoutRequestId: string; merchantRequestId: string; phone: string }): Promise<void> {
    await db
      .update(billingInvoices)
      .set({ checkoutRequestId: ids.checkoutRequestId, merchantRequestId: ids.merchantRequestId, payerPhone: ids.phone, updatedAt: new Date().toISOString() })
      .where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.status, "open")));
  }

  async markPromptFailed(invoiceId: string, reason: string): Promise<void> {
    await db
      .update(billingInvoices)
      .set({ paymentState: "failed", failureReason: reason.slice(0, 200), updatedAt: new Date().toISOString() })
      .where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.status, "open")));
  }

  /**
   * Settles an invoice and applies it to the subscription in ONE transaction, so there is never a paid invoice without the
   * plan/period it bought (or the reverse). Compare-and-set on status makes a replayed callback a harmless no-op. A payment
   * is the authority here: it activates the plan from trialing, past_due, expired or cancelled alike and consumes any trial.
   */
  async settlePaid(invoiceId: string, evidence: { receipt: string | null; paidAtIso: string }): Promise<SettleResult> {
    try {
      return db.transaction(
        (tx): SettleResult => {
          const invoiceRow = tx
            .update(billingInvoices)
            .set({ status: "paid", paymentState: "none", receipt: evidence.receipt, paidAt: evidence.paidAtIso, failureReason: null, updatedAt: evidence.paidAtIso })
            .where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.status, "open")))
            .returning()
            .get();
          if (!invoiceRow) return { ok: false, reason: "not_open" };
          const updated = tx
            .update(subscriptions)
            .set({
              plan: invoiceRow.plan,
              status: "active",
              trialEndsAt: null,
              currentPeriodStart: invoiceRow.periodStart,
              currentPeriodEnd: invoiceRow.periodEnd,
              cancelAtPeriodEnd: false,
              provider: "mpesa",
              providerStatus: "paid",
              updatedAt: evidence.paidAtIso,
            })
            .where(eq(subscriptions.businessId, invoiceRow.businessId))
            .returning({ id: subscriptions.id })
            .get();
          if (!updated) throw new NoSubscriptionRollback();
          return { ok: true, invoice: toInvoice(invoiceRow) };
        },
        { behavior: "immediate" }
      );
    } catch (error) {
      if (error instanceof NoSubscriptionRollback) return { ok: false, reason: "no_subscription" };
      if (isUniqueViolation(error)) return { ok: false, reason: "duplicate_receipt" };
      throw error;
    }
  }

  /** Grace elapsed with no payment: close the invoice and end the paid subscription (effective plan becomes free Starter; data untouched). */
  async closeUncollectible(invoiceId: string, nowIso: string): Promise<boolean> {
    return db.transaction(
      (tx) => {
        const row = tx.update(billingInvoices).set({ status: "uncollectible", updatedAt: nowIso }).where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.status, "open"))).returning().get();
        if (!row) return false;
        tx.update(subscriptions).set({ status: "cancelled", cancelAtPeriodEnd: false, providerStatus: "unpaid", updatedAt: nowIso }).where(eq(subscriptions.businessId, row.businessId)).run();
        return true;
      },
      { behavior: "immediate" }
    );
  }

  /** An unpaid upgrade attempt lapses: open -> void (compare-and-set). Nothing about the subscription changes. */
  async voidInvoice(invoiceId: string, nowIso: string): Promise<boolean> {
    const rows = await db.update(billingInvoices).set({ status: "void", updatedAt: nowIso }).where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.status, "open"))).returning({ id: billingInvoices.id });
    return rows.length > 0;
  }

  async markPastDue(businessId: string, nowIso: string): Promise<boolean> {
    const rows = await db
      .update(subscriptions)
      .set({ status: "past_due", providerStatus: "past_due", updatedAt: nowIso })
      .where(and(eq(subscriptions.businessId, businessId), eq(subscriptions.status, "active")))
      .returning({ id: subscriptions.id });
    return rows.length > 0;
  }

  async saveBillingPhone(businessId: string, phone: string): Promise<void> {
    await db.update(subscriptions).set({ provider: "mpesa", providerCustomerId: phone, updatedAt: new Date().toISOString() }).where(eq(subscriptions.businessId, businessId));
  }

  /** Paid, auto-renewing subscriptions whose period ends within `horizonIso` and so need a renewal invoice. */
  async listRenewalCandidates(horizonIso: string): Promise<Array<{ businessId: string; plan: SubscriptionPlan; status: string; periodEnd: string; phone: string | null }>> {
    const paidPlans = listPlans().map((p) => p.id).filter(isPaidPlan);
    const rows = await db
      .select({ businessId: subscriptions.businessId, plan: subscriptions.plan, status: subscriptions.status, periodEnd: subscriptions.currentPeriodEnd, phone: subscriptions.providerCustomerId })
      .from(subscriptions)
      .where(and(inArray(subscriptions.plan, paidPlans), inArray(subscriptions.status, ["active", "past_due"]), eq(subscriptions.cancelAtPeriodEnd, false), lte(subscriptions.currentPeriodEnd, horizonIso)));
    return rows.filter((r): r is typeof r & { periodEnd: string } => r.periodEnd !== null).map((r) => ({ businessId: r.businessId, plan: r.plan as SubscriptionPlan, status: r.status, periodEnd: r.periodEnd, phone: r.phone }));
  }

  async listOpenInvoices(): Promise<BillingInvoice[]> {
    return (await db.select().from(billingInvoices).where(eq(billingInvoices.status, "open"))).map(toInvoice);
  }

  async getSubscriptionPhone(businessId: string): Promise<string | null> {
    const rows = await db.select({ phone: subscriptions.providerCustomerId, provider: subscriptions.provider }).from(subscriptions).where(eq(subscriptions.businessId, businessId)).limit(1);
    return rows[0]?.provider === "mpesa" ? (rows[0].phone ?? null) : null;
  }
}

class NoSubscriptionRollback extends Error {}

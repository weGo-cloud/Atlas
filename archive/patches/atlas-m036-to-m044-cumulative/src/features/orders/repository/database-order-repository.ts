import { randomUUID } from "node:crypto";

import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { customers, furnitureOrderLines, furnitureOrders, furnitureProducts, payments, type FurnitureOrderRow } from "@/lib/db/schema";
import { computeBalance } from "@/features/payments/domain/balance";
import type { PaymentKind, PaymentStatus } from "@/features/payments/domain/payment";
import { computeOrderTotals, type FurnitureOrder, type FurnitureOrderWithLines, type OrderErrorCode, type OrderLine, type OrderStatus } from "../domain/order";
import type { ValidNewOrder } from "../domain/validate-order-input";

export class OrderRuleError extends Error {
  constructor(
    readonly code: OrderErrorCode,
    message: string
  ) {
    super(message);
    this.name = "OrderRuleError";
  }
}

export type RepoResult<T> = { ok: true; data: T } | { ok: false; code: OrderErrorCode; message: string };

export function toOrder(row: FurnitureOrderRow): FurnitureOrder {
  return {
    id: row.id,
    businessId: row.businessId,
    reference: row.reference,
    customerId: row.customerId,
    status: row.status as OrderStatus,
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    discount: row.discount,
    total: row.total,
    deliveryAddress: row.deliveryAddress,
    deliveryDate: row.deliveryDate,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    confirmedAt: row.confirmedAt,
    fulfilledAt: row.fulfilledAt,
    cancelledAt: row.cancelledAt,
    cancelledReason: row.cancelledReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Mission 042 — business-scoped furniture orders. Every state change is ONE immediate transaction and is also enforced by
 * database triggers: stock is committed with a guarded `UPDATE ... WHERE stock_quantity >= n` (so two simultaneous orders can
 * never oversell the last unit), cancellation restores it, and cancelling a confirmed order is refused while money is still on it.
 */
export class DatabaseOrderRepository {
  constructor(private readonly businessId: string) {}

  private async guard<T>(work: () => T): Promise<RepoResult<T>> {
    try {
      return { ok: true, data: work() };
    } catch (error) {
      if (error instanceof OrderRuleError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  }

  async createDraft(input: ValidNewOrder, createdByUserId: string): Promise<RepoResult<FurnitureOrderWithLines>> {
    const businessId = this.businessId;
    return this.guard(() =>
      db.transaction(
        (tx) => {
          const customer = tx.select({ id: customers.id, name: customers.name }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.businessId, businessId))).get();
          if (!customer) throw new OrderRuleError("CUSTOMER_NOT_FOUND", "Customer not found.");

          const ids = input.lines.map((l) => l.productId);
          const products = tx.select().from(furnitureProducts).where(and(inArray(furnitureProducts.id, ids), eq(furnitureProducts.businessId, businessId))).all();
          if (products.length !== ids.length) throw new OrderRuleError("PRODUCT_NOT_FOUND", "One of the products no longer exists.");
          const byId = new Map(products.map((p) => [p.id, p]));

          const lineRows = input.lines.map((l) => {
            const p = byId.get(l.productId)!;
            return { productId: p.id, name: p.name, sku: p.sku, unitPrice: p.price, quantity: l.quantity, lineTotal: p.price * l.quantity };
          });
          const totals = computeOrderTotals(lineRows, input.deliveryFee, input.discount);
          if (totals.total < 0) throw new OrderRuleError("VALIDATION_ERROR", "The discount can't be more than the order value.");

          const count = tx.select({ n: sql<number>`count(*)` }).from(furnitureOrders).where(eq(furnitureOrders.businessId, businessId)).get()?.n ?? 0;
          const orderId = `ord_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
          const row = tx
            .insert(furnitureOrders)
            .values({
              id: orderId,
              businessId,
              reference: `ORD-${String(count + 1).padStart(4, "0")}`,
              customerId: input.customerId,
              status: "draft",
              subtotal: totals.subtotal,
              deliveryFee: input.deliveryFee,
              discount: input.discount,
              total: totals.total,
              deliveryAddress: input.deliveryAddress,
              deliveryDate: input.deliveryDate,
              notes: input.notes,
              createdByUserId,
            })
            .returning()
            .get();
          const lines = tx
            .insert(furnitureOrderLines)
            .values(lineRows.map((l) => ({ id: `ordl_${randomUUID().replace(/-/g, "").slice(0, 16)}`, orderId, businessId, ...l })))
            .returning()
            .all();
          return { ...toOrder(row), customerName: customer.name, lines: lines.map(toLine) };
        },
        { behavior: "immediate" }
      )
    );
  }

  async getWithLines(id: string): Promise<FurnitureOrderWithLines | null> {
    const rows = await db
      .select({ order: furnitureOrders, customerName: customers.name })
      .from(furnitureOrders)
      .leftJoin(customers, eq(customers.id, furnitureOrders.customerId))
      .where(and(eq(furnitureOrders.id, id), eq(furnitureOrders.businessId, this.businessId)))
      .limit(1);
    if (!rows[0]) return null;
    const lines = await db.select().from(furnitureOrderLines).where(and(eq(furnitureOrderLines.orderId, id), eq(furnitureOrderLines.businessId, this.businessId)));
    return { ...toOrder(rows[0].order), customerName: rows[0].customerName, lines: lines.map(toLine) };
  }

  async list(options: { limit: number; status?: OrderStatus; customerId?: string }): Promise<Array<FurnitureOrder & { customerName: string | null; itemCount: number }>> {
    const conditions = [eq(furnitureOrders.businessId, this.businessId)];
    if (options.status) conditions.push(eq(furnitureOrders.status, options.status));
    if (options.customerId) conditions.push(eq(furnitureOrders.customerId, options.customerId));
    const rows = await db
      .select({ order: furnitureOrders, customerName: customers.name, itemCount: sql<number>`(SELECT COALESCE(SUM(quantity), 0) FROM furniture_order_lines WHERE order_id = ${furnitureOrders.id})` })
      .from(furnitureOrders)
      .leftJoin(customers, eq(customers.id, furnitureOrders.customerId))
      .where(and(...conditions))
      .orderBy(desc(furnitureOrders.createdAt), desc(furnitureOrders.reference))
      .limit(Math.min(Math.max(options.limit, 1), 200));
    return rows.map((r) => ({ ...toOrder(r.order), customerName: r.customerName, itemCount: r.itemCount }));
  }

  /** draft -> confirmed, committing stock for every line in the same transaction. All-or-nothing. */
  async confirm(id: string): Promise<RepoResult<FurnitureOrder>> {
    const businessId = this.businessId;
    return this.guard(() =>
      db.transaction(
        (tx) => {
          const order = tx.select().from(furnitureOrders).where(and(eq(furnitureOrders.id, id), eq(furnitureOrders.businessId, businessId))).get();
          if (!order) throw new OrderRuleError("NOT_FOUND", "Order not found.");
          if (order.status !== "draft") throw new OrderRuleError("INVALID_STATE", "Only a draft order can be confirmed.");
          const lines = tx.select().from(furnitureOrderLines).where(eq(furnitureOrderLines.orderId, id)).all();
          if (lines.length === 0) throw new OrderRuleError("VALIDATION_ERROR", "Add at least one item before confirming.");

          const now = new Date().toISOString();
          const wanted = new Map<string, number>();
          for (const line of lines) {
            if (!line.productId) throw new OrderRuleError("PRODUCT_NOT_FOUND", `“${line.name}” no longer exists in your inventory.`);
            wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.quantity);
          }
          for (const [productId, quantity] of wanted) {
            const updated = tx
              .update(furnitureProducts)
              .set({
                stockQuantity: sql`${furnitureProducts.stockQuantity} - ${quantity}`,
                status: sql<string>`CASE WHEN ${furnitureProducts.stockQuantity} - ${quantity} <= 0 THEN 'sold' ELSE ${furnitureProducts.status} END`,
                updatedAt: now,
              })
              .where(and(eq(furnitureProducts.id, productId), eq(furnitureProducts.businessId, businessId), gte(furnitureProducts.stockQuantity, quantity), ne(furnitureProducts.status, "sold")))
              .returning({ id: furnitureProducts.id })
              .all();
            if (updated.length === 0) {
              const p = tx.select({ name: furnitureProducts.name, stock: furnitureProducts.stockQuantity, status: furnitureProducts.status }).from(furnitureProducts).where(and(eq(furnitureProducts.id, productId), eq(furnitureProducts.businessId, businessId))).get();
              throw new OrderRuleError("INSUFFICIENT_STOCK", p ? `Not enough stock for “${p.name}”: you need ${quantity} but ${p.status === "sold" ? 0 : p.stock} ${p.status === "sold" || p.stock === 1 ? "is" : "are"} available.` : "A product on this order no longer exists.");
            }
          }
          const row = tx.update(furnitureOrders).set({ status: "confirmed", confirmedAt: now, updatedAt: now }).where(eq(furnitureOrders.id, id)).returning().get();
          return toOrder(row);
        },
        { behavior: "immediate" }
      )
    );
  }

  async fulfil(id: string): Promise<RepoResult<FurnitureOrder>> {
    return this.guard(() => {
      const now = new Date().toISOString();
      const row = db.update(furnitureOrders).set({ status: "fulfilled", fulfilledAt: now, updatedAt: now }).where(and(eq(furnitureOrders.id, id), eq(furnitureOrders.businessId, this.businessId), eq(furnitureOrders.status, "confirmed"))).returning().get();
      if (!row) throw new OrderRuleError("INVALID_STATE", "Only a confirmed order can be marked fulfilled.");
      return toOrder(row);
    });
  }

  /** draft/confirmed -> cancelled. A confirmed order restores its stock, but only after its payments are refunded or reversed. */
  async cancel(id: string, reason: string): Promise<RepoResult<FurnitureOrder>> {
    const businessId = this.businessId;
    return this.guard(() =>
      db.transaction(
        (tx) => {
          const order = tx.select().from(furnitureOrders).where(and(eq(furnitureOrders.id, id), eq(furnitureOrders.businessId, businessId))).get();
          if (!order) throw new OrderRuleError("NOT_FOUND", "Order not found.");
          if (order.status !== "draft" && order.status !== "confirmed") throw new OrderRuleError("INVALID_STATE", "Only a draft or confirmed order can be cancelled.");
          const now = new Date().toISOString();

          if (order.status === "confirmed") {
            const rows = tx.select({ amount: payments.amount, kind: payments.kind, status: payments.status }).from(payments).where(and(eq(payments.orderId, id), eq(payments.businessId, businessId))).all() as Array<{ amount: number; kind: PaymentKind; status: PaymentStatus }>;
            const summary = computeBalance(order.total, rows);
            if (summary.netPaid !== 0 || summary.pending !== 0) {
              throw new OrderRuleError("HAS_PAYMENTS", "This order has payments on it. Refund or reverse them first, then cancel.");
            }
            for (const line of tx.select().from(furnitureOrderLines).where(eq(furnitureOrderLines.orderId, id)).all()) {
              if (!line.productId) continue;
              tx.update(furnitureProducts)
                .set({ stockQuantity: sql`${furnitureProducts.stockQuantity} + ${line.quantity}`, status: sql<string>`CASE WHEN ${furnitureProducts.status} = 'sold' THEN 'available' ELSE ${furnitureProducts.status} END`, updatedAt: now })
                .where(and(eq(furnitureProducts.id, line.productId), eq(furnitureProducts.businessId, businessId)))
                .run();
            }
          }
          const row = tx.update(furnitureOrders).set({ status: "cancelled", cancelledAt: now, cancelledReason: reason, updatedAt: now }).where(eq(furnitureOrders.id, id)).returning().get();
          return toOrder(row);
        },
        { behavior: "immediate" }
      )
    );
  }
}

function toLine(row: typeof furnitureOrderLines.$inferSelect): OrderLine {
  return { id: row.id, orderId: row.orderId, productId: row.productId, name: row.name, sku: row.sku, unitPrice: row.unitPrice, quantity: row.quantity, lineTotal: row.lineTotal };
}

import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../test-support/action-test-harness";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";
import { validateNewOrder } from "../domain/validate-order-input";
import type { MpesaClient, StkPushRequest } from "../../payments/mpesa/daraja-client";
import type { OrderService } from "../service/order-service";

const harness = new ActionTestHarness();
let getOrderService: (id: string) => OrderService;
let getPaymentService: typeof import("../../payments/service").getPaymentService;
let n = 0;

class FakeMpesa implements MpesaClient {
  pushes: StkPushRequest[] = [];
  async verifyCredentials() {}
  async registerC2bUrls() {}
  async stkPush(r: StkPushRequest) {
    this.pushes.push(r);
    return { merchantRequestId: "mr", checkoutRequestId: `ws_${randomBytes(4).toString("hex")}`, customerMessage: "ok" };
  }
  async stkQuery() {
    return { resultCode: 0, resultDesc: "ok" };
  }
}

beforeAll(async () => {
  await harness.setup();
  getOrderService = (await import("../service/order-service")).getOrderService;
  getPaymentService = (await import("../../payments/service")).getPaymentService;
});
afterAll(() => harness.teardown());
beforeEach(() => resetRateLimitsForTests());

// No harness.reset(): orders and payments are append-only, so every test builds its own business.
function shop(plan: "starter" | "growth" | "pro" = "pro") {
  const business = harness.seedBusiness(`Furn ${Math.random()}`, plan);
  harness.run("UPDATE businesses SET vertical = 'furniture' WHERE id = ?", business.id);
  const customer = harness.seedCustomer(business.id);
  return { business, customer, orders: getOrderService(business.id) };
}
function product(businessId: string, name: string, price: number, stock: number) {
  n += 1;
  const id = `furn_t${n}_${randomBytes(3).toString("hex")}`;
  harness.run(
    "INSERT INTO furniture_products (id, business_id, name, description, category, price, condition, status, stock_quantity, added_at, updated_at) VALUES (?, ?, ?, '', 'sofas', ?, 'new', ?, ?, datetime('now'), datetime('now'))",
    id, businessId, name, price, stock > 0 ? "available" : "sold", stock
  );
  return id;
}
const stockOf = (id: string) => harness.row<{ stock_quantity: number; status: string }>("SELECT stock_quantity, status FROM furniture_products WHERE id = ?", id)!;
const draft = async (s: ReturnType<typeof shop>, lines: Array<{ productId: string; quantity: number }>, extra: Record<string, unknown> = {}) => {
  const r = await s.orders.createDraft({ customerId: s.customer.id, lines, ...extra }, "u1");
  if (!r.ok) throw new Error(`draft failed: ${JSON.stringify(r.error)}`);
  return r.data;
};

describe("order input validation", () => {
  const ok = { customerId: "cust_1", lines: [{ productId: "furn_1", quantity: 2 }] };
  it("merges duplicate products and bounds quantities, money and counts", () => {
    const merged = validateNewOrder({ ...ok, lines: [{ productId: "furn_1", quantity: 2 }, { productId: "furn_1", quantity: 3 }] });
    expect(merged.ok && merged.value.lines).toEqual([{ productId: "furn_1", quantity: 5 }]);
    for (const bad of [{ lines: [] }, { lines: [{ productId: "furn_1", quantity: 0 }] }, { lines: [{ productId: "furn_1", quantity: 1.5 }] }, { lines: [{ productId: "furn_1", quantity: 1000 }] }, { lines: [{ productId: "x y", quantity: 1 }] }, { deliveryFee: "-5" }, { discount: "12.5" }, { deliveryDate: "nonsense" }, { customerId: "" }]) {
      expect(validateNewOrder({ ...ok, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(validateNewOrder({ ...ok, lines: Array.from({ length: 51 }, (_, i) => ({ productId: `furn_${i}`, quantity: 1 })) }).ok).toBe(false);
  });
});

describe("creating a draft", () => {
  it("snapshots prices from inventory, computes totals and numbers orders per business", async () => {
    const s = shop();
    const sofa = product(s.business.id, "Oak Sofa", 45_000, 3);
    const lamp = product(s.business.id, "Lamp", 2_500, 10);
    const o1 = await draft(s, [{ productId: sofa, quantity: 2 }, { productId: lamp, quantity: 4 }], { deliveryFee: 1500, discount: 5000 });
    expect(o1).toMatchObject({ reference: "ORD-0001", status: "draft", subtotal: 100_000, total: 96_500 });
    expect(o1.lines.map((l) => [l.name, l.unitPrice, l.lineTotal])).toEqual(expect.arrayContaining([["Oak Sofa", 45_000, 90_000], ["Lamp", 2_500, 10_000]]));
    expect((await draft(s, [{ productId: lamp, quantity: 1 }])).reference).toBe("ORD-0002");
    harness.run("UPDATE furniture_products SET price = 1 WHERE id = ?", sofa); // repricing later never rewrites the order
    expect((await s.orders.get(o1.id))?.total).toBe(96_500);
    expect(stockOf(sofa).stock_quantity).toBe(3); // a draft commits nothing
  });

  it("refuses unknown products, other businesses' customers/products, and over-large discounts", async () => {
    const a = shop();
    const b = shop();
    const mine = product(a.business.id, "Mine", 1000, 5);
    const theirs = product(b.business.id, "Theirs", 1000, 5);
    expect((await a.orders.createDraft({ customerId: a.customer.id, lines: [{ productId: "furn_missing", quantity: 1 }] }, "u1")).ok).toBe(false);
    expect((await a.orders.createDraft({ customerId: a.customer.id, lines: [{ productId: theirs, quantity: 1 }] }, "u1")).ok).toBe(false);
    expect((await a.orders.createDraft({ customerId: b.customer.id, lines: [{ productId: mine, quantity: 1 }] }, "u1")).ok).toBe(false);
    const tooMuch = await a.orders.createDraft({ customerId: a.customer.id, lines: [{ productId: mine, quantity: 1 }], discount: 5000 }, "u1");
    expect(!tooMuch.ok && tooMuch.error.message).toMatch(/discount/i);
  });
});

describe("confirming commits stock without ever overselling", () => {
  it("decrements stock, flips status at zero, and is all-or-nothing across lines", async () => {
    const s = shop();
    const a = product(s.business.id, "A", 1000, 2);
    const b = product(s.business.id, "B", 1000, 1);
    const ok = await draft(s, [{ productId: a, quantity: 2 }, { productId: b, quantity: 1 }]);
    expect((await s.orders.confirm(ok.id, "u1")).ok).toBe(true);
    expect(stockOf(a)).toEqual({ stock_quantity: 0, status: "sold" });
    expect(stockOf(b)).toEqual({ stock_quantity: 0, status: "sold" });

    const c = product(s.business.id, "C", 1000, 5);
    const d = product(s.business.id, "D", 1000, 1);
    const bad = await draft(s, [{ productId: c, quantity: 3 }, { productId: d, quantity: 2 }]);
    const r = await s.orders.confirm(bad.id, "u1");
    expect(!r.ok && r.error.code).toBe("INSUFFICIENT_STOCK");
    expect(stockOf(c).stock_quantity).toBe(5); // first line was rolled back with the failure
    expect((await s.orders.get(bad.id))?.status).toBe("draft");
  });

  it("two orders for the last unit: exactly one wins", async () => {
    const s = shop();
    const last = product(s.business.id, "Last one", 9000, 1);
    const first = await draft(s, [{ productId: last, quantity: 1 }]);
    const second = await draft(s, [{ productId: last, quantity: 1 }]);
    const results = await Promise.all([s.orders.confirm(first.id, "u1"), s.orders.confirm(second.id, "u2")]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(stockOf(last)).toEqual({ stock_quantity: 0, status: "sold" });
  });

  it("only a draft can be confirmed, and an empty or sold-out order can't be", async () => {
    const s = shop();
    const p = product(s.business.id, "P", 1000, 3);
    const o = await draft(s, [{ productId: p, quantity: 1 }]);
    await s.orders.confirm(o.id, "u1");
    const again = await s.orders.confirm(o.id, "u1");
    expect(!again.ok && again.error.code).toBe("INVALID_STATE");
    expect(stockOf(p).stock_quantity).toBe(2); // not decremented twice
    const gone = product(s.business.id, "Gone", 1000, 0);
    const soldOut = await draft(s, [{ productId: gone, quantity: 1 }]);
    expect((await s.orders.confirm(soldOut.id, "u1")).ok).toBe(false);
  });
});

describe("cancelling and fulfilling", () => {
  it("a draft cancels freely; a confirmed one restores stock (sold -> available)", async () => {
    const s = shop();
    const p = product(s.business.id, "P", 1000, 1);
    const d = await draft(s, [{ productId: p, quantity: 1 }]);
    expect((await s.orders.cancel(d.id, "changed mind", "u1")).ok).toBe(true);
    expect(stockOf(p).stock_quantity).toBe(1);

    const o = await draft(s, [{ productId: p, quantity: 1 }]);
    await s.orders.confirm(o.id, "u1");
    expect(stockOf(p)).toEqual({ stock_quantity: 0, status: "sold" });
    expect((await s.orders.cancel(o.id, "customer withdrew", "u1")).ok).toBe(true);
    expect(stockOf(p)).toEqual({ stock_quantity: 1, status: "available" });
    const twice = await s.orders.cancel(o.id, "again", "u1");
    expect(!twice.ok && twice.error.code).toBe("INVALID_STATE");
    expect(stockOf(p).stock_quantity).toBe(1); // not restored twice
  });

  it("fulfilled orders are final", async () => {
    const s = shop();
    const p = product(s.business.id, "P", 1000, 2);
    const o = await draft(s, [{ productId: p, quantity: 1 }]);
    expect((await s.orders.fulfil(o.id, "u1")).ok).toBe(false); // draft can't be fulfilled
    await s.orders.confirm(o.id, "u1");
    expect((await s.orders.fulfil(o.id, "u1")).ok).toBe(true);
    expect((await s.orders.cancel(o.id, "too late", "u1")).ok).toBe(false);
    expect((await s.orders.fulfil(o.id, "u1")).ok).toBe(false);
  });

  it("a cancellation needs a reason and can't touch another business's order", async () => {
    const a = shop();
    const b = shop();
    const p = product(a.business.id, "P", 1000, 2);
    const o = await draft(a, [{ productId: p, quantity: 1 }]);
    expect((await a.orders.cancel(o.id, "", "u1")).ok).toBe(false);
    expect((await b.orders.cancel(o.id, "sneaky cancel", "u1")).ok).toBe(false);
    expect((await b.orders.confirm(o.id, "u1")).ok).toBe(false);
    expect(await b.orders.get(o.id)).toBeNull();
    expect((await a.orders.get(o.id))?.status).toBe("draft");
  });
});

describe("payments against an order", () => {
  const payInput = (customerId: string, orderId: string, amount: number, extra: Record<string, unknown> = {}) => ({ customerId, orderId, amount, method: "cash", kind: "deposit", ...extra });

  it("only confirmed orders take payments; balance follows the order total; no overpayment", async () => {
    const s = shop();
    const p = product(s.business.id, "P", 10_000, 3);
    const o = await draft(s, [{ productId: p, quantity: 1 }]);
    const pay = getPaymentService(s.business.id);
    const early = await pay.recordPayment(payInput(s.customer.id, o.id, 1000), "u1");
    expect(!early.ok && early.error.code).toBe("INVALID_STATE");

    await s.orders.confirm(o.id, "u1");
    expect((await pay.recordPayment(payInput(s.customer.id, o.id, 4000), "u1")).ok).toBe(true);
    const over = await pay.recordPayment(payInput(s.customer.id, o.id, 7000), "u1");
    expect(!over.ok && over.error.code).toBe("OVERPAYMENT");
    expect((await pay.recordPayment(payInput(s.customer.id, o.id, 6000, { kind: "balance" }), "u1")).ok).toBe(true);
    const view = await pay.getOrderPayments(o.id);
    expect(view.ok && view.data.summary).toMatchObject({ agreedPrice: 10_000, netPaid: 10_000, balance: 0, status: "paid" });
  });

  it("can't be paid for another customer, another business, or a cancelled order", async () => {
    const a = shop();
    const b = shop();
    const p = product(a.business.id, "P", 5000, 2);
    const o = await draft(a, [{ productId: p, quantity: 1 }]);
    await a.orders.confirm(o.id, "u1");
    const other = harness.seedCustomer(a.business.id, "Someone Else");
    expect((await getPaymentService(a.business.id).recordPayment(payInput(other.id, o.id, 100), "u1")).ok).toBe(false);
    expect((await getPaymentService(b.business.id).recordPayment(payInput(b.customer.id, o.id, 100), "u1")).ok).toBe(false);
    expect((await getPaymentService(b.business.id).getOrderPayments(o.id)).ok).toBe(false);
    await a.orders.cancel(o.id, "no longer needed", "u1");
    expect((await getPaymentService(a.business.id).recordPayment(payInput(a.customer.id, o.id, 100), "u1")).ok).toBe(false);
  });

  it("a paid order can't be cancelled until the money is refunded or reversed", async () => {
    const s = shop();
    const p = product(s.business.id, "P", 8000, 2);
    const o = await draft(s, [{ productId: p, quantity: 1 }]);
    await s.orders.confirm(o.id, "u1");
    const pay = getPaymentService(s.business.id);
    const paid = await pay.recordPayment(payInput(s.customer.id, o.id, 3000), "u1");
    if (!paid.ok) throw new Error("setup");
    const blocked = await s.orders.cancel(o.id, "wants out", "u1");
    expect(!blocked.ok && blocked.error.code).toBe("HAS_PAYMENTS");
    expect(stockOf(p).stock_quantity).toBe(1); // stock untouched by the refused cancel

    await pay.reversePayment(paid.data.id, "refunded in cash to customer", "owner");
    expect((await s.orders.cancel(o.id, "wants out", "u1")).ok).toBe(true);
    expect(stockOf(p).stock_quantity).toBe(2);
  });

  it("M-Pesa prompts work for orders and carry the order id", async () => {
    const s = shop();
    const fake = new FakeMpesa();
    const pay = getPaymentService(s.business.id, { mpesaFactory: () => fake });
    const p = product(s.business.id, "P", 6000, 2);
    const o = await draft(s, [{ productId: p, quantity: 1 }]);
    await s.orders.confirm(o.id, "u1");
    const connected = await pay.connectAccount({ environment: "sandbox", transactionType: "paybill", shortcode: "174379", tillNumber: "", consumerKey: "k".repeat(24), consumerSecret: "s".repeat(24), passkey: "p".repeat(64) }, "u1");
    expect(connected.ok).toBe(true);
    process.env.PUBLIC_BASE_URL = "https://atlas.test";
    const r = await pay.requestMpesaStk({ orderId: o.id, phone: "0712345678", amount: 6000, kind: "deposit" }, "u1");
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(fake.pushes[0].accountReference.startsWith("ORD")).toBe(true);
    const row = harness.row<{ order_id: string; deal_id: string | null; status: string }>("SELECT order_id, deal_id, status FROM payments WHERE business_id = ?", s.business.id)!;
    expect(row).toMatchObject({ order_id: o.id, deal_id: null, status: "pending" });
    const more = await pay.requestMpesaStk({ orderId: o.id, phone: "0722000111", amount: 1, kind: "deposit" }, "u1");
    expect(!more.ok && more.error.code).toBe("OVERPAYMENT"); // pending prompt reserves the whole balance
    expect((await pay.requestMpesaStk({ dealId: "d_1", orderId: o.id, phone: "0733000111", amount: 1, kind: "deposit" }, "u1")).ok).toBe(false);
  });
});

describe("the database enforces the same rules", () => {
  it("locks confirmed orders, forbids deletes and status regressions, forbids negative stock and deal+order payments", async () => {
    const s = shop();
    const p = product(s.business.id, "P", 1000, 5);
    const o = await draft(s, [{ productId: p, quantity: 1 }]);
    await s.orders.confirm(o.id, "u1");
    const lineId = harness.row<{ id: string }>("SELECT id FROM furniture_order_lines WHERE order_id = ?", o.id)!.id;
    expect(() => harness.run("UPDATE furniture_order_lines SET quantity = 99 WHERE id = ?", lineId)).toThrow(/draft/);
    expect(() => harness.run("DELETE FROM furniture_order_lines WHERE id = ?", lineId)).toThrow(/draft/);
    expect(() => harness.run("INSERT INTO furniture_order_lines (id, order_id, business_id, name, unit_price, quantity, line_total) VALUES ('x', ?, ?, 'sneaky', 1, 1, 1)", o.id, s.business.id)).toThrow(/draft/);
    expect(() => harness.run("UPDATE furniture_orders SET total = 1 WHERE id = ?", o.id)).toThrow(/totals/);
    expect(() => harness.run("UPDATE furniture_orders SET status = 'draft' WHERE id = ?", o.id)).toThrow(/invalid order status/);
    expect(() => harness.run("UPDATE furniture_orders SET customer_id = 'other' WHERE id = ?", o.id)).toThrow(/immutable/);
    expect(() => harness.run("DELETE FROM furniture_orders WHERE id = ?", o.id)).toThrow(/append-only/);
    expect(() => harness.run("UPDATE furniture_products SET stock_quantity = -1 WHERE id = ?", p)).toThrow(/below zero/);
    expect(() =>
      harness.run("INSERT INTO payments (id, business_id, customer_id, deal_id, order_id, amount, method, paid_at) VALUES ('pp', ?, ?, 'deal_x', ?, 5, 'cash', 'now')", s.business.id, s.customer.id, o.id)
    ).toThrow(/not both/);
  });
});

describe("editing stock on a product keeps its status honest", () => {
  it("0 units means sold; restocking a sold item makes it available again", async () => {
    const s = shop();
    const { DatabaseFurnitureProductRepository } = await import("../../furniture/repository/database-furniture-product-repository");
    const repo = new DatabaseFurnitureProductRepository(s.business.id);
    const p = product(s.business.id, "P", 1000, 4);
    await repo.update(p, { stockQuantity: 0 });
    expect(stockOf(p)).toEqual({ stock_quantity: 0, status: "sold" });
    await repo.update(p, { stockQuantity: 6 });
    expect(stockOf(p)).toEqual({ stock_quantity: 6, status: "available" });
  });
});

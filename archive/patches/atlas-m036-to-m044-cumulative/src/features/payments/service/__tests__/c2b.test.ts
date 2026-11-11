import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../../test-support/action-test-harness";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";
import { parseC2bConfirmation } from "../../mpesa/c2b";
import { DarajaError, type MpesaClient, type StkPushRequest } from "../../mpesa/daraja-client";
import type { PaymentService } from "../payment-service";

class FakeMpesa implements MpesaClient {
  registrations: Array<{ confirmationUrl: string; validationUrl: string }> = [];
  registerFails = false;
  async verifyCredentials() {}
  async registerC2bUrls(urls: { confirmationUrl: string; validationUrl: string }) {
    if (this.registerFails) throw new DarajaError("M-Pesa couldn't register the payment notifications.", "rejected");
    this.registrations.push(urls);
  }
  async stkPush(_r: StkPushRequest) {
    return { merchantRequestId: "m", checkoutRequestId: "c", customerMessage: "ok" };
  }
  async stkQuery() {
    return { resultCode: 0, resultDesc: "ok" };
  }
}

const harness = new ActionTestHarness();
let fake: FakeMpesa;
let getPaymentService: typeof import("../index").getPaymentService;
let getOrderService: typeof import("../../../orders/service/order-service").getOrderService;
let seq = 0;
const base = process.env.PUBLIC_BASE_URL;

beforeAll(async () => {
  process.env.PUBLIC_BASE_URL = "https://atlas.test";
  await harness.setup();
  getPaymentService = (await import("../index")).getPaymentService;
  getOrderService = (await import("../../../orders/service/order-service")).getOrderService;
});
afterAll(() => {
  harness.teardown();
  if (base === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = base;
});
beforeEach(() => {
  resetRateLimitsForTests();
  fake = new FakeMpesa();
});

function scenario(plan: "starter" | "pro" = "pro", agreedPrice = 20_000) {
  const business = harness.seedBusiness(`C2B ${Math.random()}`, plan);
  const customer = harness.seedCustomer(business.id);
  const lead = harness.seedLead(business.id, customer.id);
  const deal = harness.seedDeal(business.id, customer.id, lead.id, { agreedPrice });
  const service: PaymentService = getPaymentService(business.id, { mpesaFactory: () => fake });
  return { business, customer, deal, service };
}
const connectCreds = { environment: "sandbox", transactionType: "paybill", shortcode: "174379", tillNumber: "", consumerKey: "k".repeat(24), consumerSecret: "s".repeat(24), passkey: "p".repeat(64) };
async function enabled(s: ReturnType<typeof scenario>) {
  await s.service.connectAccount(connectCreds, "u1");
  const r = await s.service.enableC2b("u1");
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return harness.row<{ callback_token: string }>("SELECT callback_token FROM payment_accounts WHERE business_id = ?", s.business.id)!.callback_token;
}
const notice = (over: Record<string, unknown> = {}) => ({
  TransactionType: "Pay Bill",
  TransID: `TX${randomBytes(4).toString("hex").toUpperCase()}`,
  TransTime: "20260105101500",
  TransAmount: "5000.00",
  BusinessShortCode: "174379",
  BillRefNumber: "",
  MSISDN: "254712345678",
  FirstName: "JANE",
  LastName: "DOE",
  ...over,
});
const inboxRows = (businessId: string) => harness.rows<{ id: string; trans_id: string; status: string; allocated_payment_id: string | null }>("SELECT id, trans_id, status, allocated_payment_id FROM c2b_payments WHERE business_id = ?", businessId);
const paymentsFor = (businessId: string) => harness.rows<{ id: string; reference: string | null; verification: string; status: string; amount: number }>("SELECT id, reference, verification, status, amount FROM payments WHERE business_id = ?", businessId);

describe("parseC2bConfirmation", () => {
  it("parses a normal notification and flags cents and hashed phone numbers", () => {
    expect(parseC2bConfirmation(notice({ TransID: "sjk4x9abcd" }))).toMatchObject({ transId: "SJK4X9ABCD", amountKes: 5000, phone: "254712345678", name: "JANE DOE", paidAt: "2026-01-05T07:15:00.000Z" });
    expect(parseC2bConfirmation(notice({ TransAmount: "100.50" }))?.amountKes).toBeNull();
    expect(parseC2bConfirmation(notice({ MSISDN: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6" }))?.phone).toBeNull();
  });
  it("rejects malformed bodies", () => {
    for (const bad of [null, [], {}, notice({ TransID: "x" }), notice({ TransID: "BAD ID!!!!" }), notice({ TransAmount: "-5" }), notice({ TransAmount: "abc" }), notice({ TransAmount: "0" })]) {
      expect(parseC2bConfirmation(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("enabling notifications", () => {
  it("needs the plan and a connected account, registers neutral URLs, and rotating credentials switches it off", async () => {
    const starter = scenario("starter");
    expect((await starter.service.enableC2b("u1")).ok).toBe(false);
    const s = scenario();
    expect((await s.service.enableC2b("u1")).ok).toBe(false); // not connected yet
    const token = await enabled(s);
    expect(fake.registrations[0].confirmationUrl).toBe(`https://atlas.test/api/c2b/in/${s.business.id}/${token}`);
    expect(JSON.stringify(fake.registrations[0])).not.toMatch(/mpesa|safaricom/i); // words Safaricom refuses in registered URLs
    expect((await s.service.getAccount())?.c2bEnabled).toBe(true);

    await s.service.connectAccount(connectCreds, "u1"); // new credentials => new token => old registration is stale
    expect((await s.service.getAccount())?.c2bEnabled).toBe(false);
  });

  it("reports a Safaricom failure without enabling anything", async () => {
    const s = scenario();
    await s.service.connectAccount(connectCreds, "u1");
    fake.registerFails = true;
    const r = await s.service.enableC2b("u1");
    expect(!r.ok && r.error.code).toBe("PROVIDER_ERROR");
    expect((await s.service.getAccount())?.c2bEnabled).toBe(false);
  });
});

describe("receiving notifications never credits anything", () => {
  it("rejects wrong tokens, disabled accounts, wrong shortcodes and junk; stores a good one exactly once", async () => {
    const s = scenario();
    await s.service.connectAccount(connectCreds, "u1");
    const before = harness.row<{ callback_token: string }>("SELECT callback_token FROM payment_accounts WHERE business_id = ?", s.business.id)!.callback_token;
    expect((await s.service.receiveC2b(before, notice())).ok).toBe(false); // registered? no: disabled
    const token = await enabled(s);
    expect((await s.service.receiveC2b("0".repeat(48), notice())).ok).toBe(false);
    expect((await s.service.receiveC2b(token, notice({ BusinessShortCode: "999999" }))).ok).toBe(false);
    expect((await s.service.receiveC2b(token, { nonsense: true })).ok).toBe(false);
    expect(inboxRows(s.business.id).length).toBe(0);

    const n = notice();
    const first = await s.service.receiveC2b(token, n);
    expect(first.ok && first.data.stored).toBe(true);
    const repeat = await s.service.receiveC2b(token, n);
    expect(repeat.ok && repeat.data.stored).toBe(false); // Safaricom retry
    expect(inboxRows(s.business.id).length).toBe(1);
    expect(paymentsFor(s.business.id).length).toBe(0); // nothing credited
  });

  it("the kill switch stops intake", async () => {
    const s = scenario();
    const token = await enabled(s);
    process.env.PAYMENTS_ENABLED = "false";
    try {
      expect((await s.service.receiveC2b(token, notice())).ok).toBe(false);
    } finally {
      delete process.env.PAYMENTS_ENABLED;
    }
  });
});

describe("allocating", () => {
  it("creates a confirmed 'reported' payment that counts toward the deal, once", async () => {
    const s = scenario();
    const token = await enabled(s);
    const n = notice({ TransID: "ABCD123456", TransAmount: "5000" });
    await s.service.receiveC2b(token, n);
    const item = inboxRows(s.business.id)[0];
    const r = await s.service.allocateC2b(item.id, { dealId: s.deal.id }, "staff1");
    expect(r.ok && r.data).toMatchObject({ status: "confirmed", verification: "reported", reference: "ABCD123456", amount: 5000, method: "mpesa" });
    const view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary).toMatchObject({ netPaid: 5000, balance: 15_000 });
    expect(inboxRows(s.business.id)[0]).toMatchObject({ status: "allocated" });
    expect(inboxRows(s.business.id)[0].allocated_payment_id).toBeTruthy();
    const again = await s.service.allocateC2b(item.id, { dealId: s.deal.id }, "staff1");
    expect(again.ok).toBe(false);
    expect(paymentsFor(s.business.id).length).toBe(1);
  });

  it("two people allocating at the same moment produce one payment", async () => {
    const s = scenario();
    const token = await enabled(s);
    await s.service.receiveC2b(token, notice({ TransAmount: "3000" }));
    const item = inboxRows(s.business.id)[0];
    const results = await Promise.all([s.service.allocateC2b(item.id, { dealId: s.deal.id }, "a"), s.service.allocateC2b(item.id, { dealId: s.deal.id }, "b")]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(paymentsFor(s.business.id).length).toBe(1);
  });

  it("a refused allocation (overpayment, duplicate receipt) gives the notification back untouched", async () => {
    const s = scenario("pro", 2000);
    const token = await enabled(s);
    await s.service.receiveC2b(token, notice({ TransAmount: "5000" }));
    const big = inboxRows(s.business.id)[0];
    const over = await s.service.allocateC2b(big.id, { dealId: s.deal.id }, "u1");
    expect(!over.ok && over.error.code).toBe("OVERPAYMENT");
    expect(inboxRows(s.business.id)[0]).toMatchObject({ status: "unallocated", allocated_payment_id: null });

    await s.service.recordPayment({ customerId: s.customer.id, dealId: s.deal.id, amount: 1000, method: "mpesa", kind: "deposit", reference: "DUPL123456" }, "u1");
    await s.service.receiveC2b(token, notice({ TransID: "DUPL123456", TransAmount: "1000" }));
    const dupe = inboxRows(s.business.id).find((r) => r.trans_id === "DUPL123456")!;
    const r = await s.service.allocateC2b(dupe.id, { dealId: s.deal.id }, "u1");
    expect(!r.ok && r.error.code).toBe("DUPLICATE_REFERENCE");
    expect(inboxRows(s.business.id).find((x) => x.id === dupe.id)?.status).toBe("unallocated");
  });

  it("rejects fractional amounts and a missing/ambiguous target; ignoring is final", async () => {
    const s = scenario();
    const token = await enabled(s);
    await s.service.receiveC2b(token, notice({ TransAmount: "100.50" }));
    const cents = inboxRows(s.business.id)[0];
    expect((await s.service.allocateC2b(cents.id, { dealId: s.deal.id }, "u1")).ok).toBe(false);
    expect((await s.service.allocateC2b(cents.id, {}, "u1")).ok).toBe(false);
    expect((await s.service.allocateC2b(cents.id, { dealId: s.deal.id, orderId: "ord_x" }, "u1")).ok).toBe(false);
    expect((await s.service.ignoreC2b(cents.id, "u1")).ok).toBe(true);
    expect((await s.service.ignoreC2b(cents.id, "u1")).ok).toBe(false);
    expect((await s.service.allocateC2b(cents.id, { dealId: s.deal.id }, "u1")).ok).toBe(false);
  });

  it("another business can't see or allocate someone else's notification", async () => {
    const a = scenario();
    const b = scenario();
    const token = await enabled(a);
    await a.service.receiveC2b(token, notice({ TransAmount: "1000" }));
    const item = inboxRows(a.business.id)[0];
    expect((await b.service.allocateC2b(item.id, { dealId: b.deal.id }, "u1")).ok).toBe(false);
    expect((await b.service.ignoreC2b(item.id, "u1")).ok).toBe(false);
    expect((await b.service.getC2bInbox()).items.length).toBe(0);
    expect(inboxRows(a.business.id)[0].status).toBe("unallocated");
  });
});

describe("suggestions", () => {
  it("matches an order by the account reference the customer typed, else a unique exact amount", async () => {
    const s = scenario("pro", 7777);
    harness.run("UPDATE businesses SET vertical = 'furniture' WHERE id = ?", s.business.id);
    harness.run("INSERT INTO furniture_products (id, business_id, name, description, category, price, condition, status, stock_quantity, added_at, updated_at) VALUES (?, ?, 'Sofa', '', 'sofas', 12000, 'new', 'available', 3, datetime('now'), datetime('now'))", `furn_c${++seq}`, s.business.id);
    const productId = harness.row<{ id: string }>("SELECT id FROM furniture_products WHERE business_id = ?", s.business.id)!.id;
    const orders = getOrderService(s.business.id);
    const draft = await orders.createDraft({ customerId: s.customer.id, lines: [{ productId, quantity: 1 }] }, "u1");
    if (!draft.ok) throw new Error("setup");
    await orders.confirm(draft.data.id, "u1");
    const token = await enabled(s);
    await s.service.receiveC2b(token, notice({ TransAmount: "100", BillRefNumber: "ord 0001" }));
    await s.service.receiveC2b(token, notice({ TransAmount: "7777", BillRefNumber: "" }));
    const { items } = await s.service.getC2bInbox();
    const byRef = items.find((i) => i.billRef === "ord 0001")!;
    expect(byRef.suggestion).toEqual({ kind: "order", id: draft.data.id });
    const byAmount = items.find((i) => i.amountKes === 7777)!;
    expect(byAmount.suggestion).toEqual({ kind: "deal", id: s.deal.id });
  });
});

describe("the database guards the inbox", () => {
  it("blocks deletes, fact edits and status regressions", async () => {
    const s = scenario();
    const token = await enabled(s);
    await s.service.receiveC2b(token, notice({ TransAmount: "1000" }));
    const item = inboxRows(s.business.id)[0];
    expect(() => harness.run("DELETE FROM c2b_payments WHERE id = ?", item.id)).toThrow(/append-only/);
    expect(() => harness.run("UPDATE c2b_payments SET amount_kes = 1 WHERE id = ?", item.id)).toThrow(/immutable/);
    expect(() => harness.run("UPDATE c2b_payments SET trans_id = 'HACKED12345' WHERE id = ?", item.id)).toThrow(/immutable/);
    await s.service.allocateC2b(item.id, { dealId: s.deal.id }, "u1");
    expect(() => harness.run("UPDATE c2b_payments SET status = 'unallocated' WHERE id = ?", item.id)).toThrow(/cannot change status/);
  });
});

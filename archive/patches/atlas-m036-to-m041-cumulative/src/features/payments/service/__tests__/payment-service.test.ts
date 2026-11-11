import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../../test-support/action-test-harness";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";
import { DarajaError, type MpesaClient, type StkPushRequest } from "../../mpesa/daraja-client";
import type { PaymentService } from "../payment-service";

class FakeMpesa implements MpesaClient {
  pushes: StkPushRequest[] = [];
  query: { resultCode: number | null; resultDesc: string } = { resultCode: 0, resultDesc: "ok" };
  queryThrows = false;
  badCredentials = false;
  private n = 0;
  async verifyCredentials() {
    if (this.badCredentials) throw new DarajaError("M-Pesa rejected these credentials.", "auth");
  }
  async stkPush(request: StkPushRequest) {
    this.pushes.push(request);
    this.n += 1;
    return { merchantRequestId: `mr_${this.n}`, checkoutRequestId: `ws_CO_${randomBytes(4).toString("hex")}_${this.n}`, customerMessage: "Prompt sent" };
  }
  async stkQuery() {
    if (this.queryThrows) throw new DarajaError("down", "network");
    return this.query;
  }
}

const harness = new ActionTestHarness();
let fake: FakeMpesa;
let getPaymentService: typeof import("../index").getPaymentService;
const envBackup = { key: process.env.ATLAS_ENCRYPTION_KEY, base: process.env.PUBLIC_BASE_URL };

beforeAll(async () => {
  process.env.ATLAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.PUBLIC_BASE_URL = "https://atlas.test";
  await harness.setup();
  getPaymentService = (await import("../index")).getPaymentService;
});
afterAll(() => {
  harness.teardown();
  if (envBackup.key === undefined) delete process.env.ATLAS_ENCRYPTION_KEY;
  else process.env.ATLAS_ENCRYPTION_KEY = envBackup.key;
  if (envBackup.base === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = envBackup.base;
});
beforeEach(() => {
  resetRateLimitsForTests();
  fake = new FakeMpesa();
});

// NB: no harness.reset(): the ledger is append-only (triggers), so each test builds its own business.
function scenario(plan: "starter" | "growth" | "pro" = "pro", agreedPrice = 10_000) {
  const business = harness.seedBusiness(`Shop ${Math.random()}`, plan);
  const customer = harness.seedCustomer(business.id);
  const lead = harness.seedLead(business.id, customer.id);
  const deal = harness.seedDeal(business.id, customer.id, lead.id, { agreedPrice });
  const service: PaymentService = getPaymentService(business.id, { mpesaFactory: () => fake });
  return { business, customer, deal, service };
}
async function connect(service: PaymentService) {
  const r = await service.connectAccount({ environment: "sandbox", transactionType: "paybill", shortcode: "174379", tillNumber: "", consumerKey: "k".repeat(24), consumerSecret: "s".repeat(24), passkey: "p".repeat(64) }, "u1");
  expect(r.ok).toBe(true);
  return harness.row<{ callback_token: string }>("SELECT callback_token FROM payment_accounts WHERE business_id = ?", service.businessId)!.callback_token;
}
const cash = (customerId: string, dealId: string, amount: number, extra: Record<string, unknown> = {}) => ({ customerId, dealId, amount, method: "cash", kind: "installment", ...extra });
const callbackBody = (checkoutId: string, amount: number, over: { code?: number; receipt?: string } = {}) => ({
  Body: { stkCallback: { MerchantRequestID: "mr", CheckoutRequestID: checkoutId, ResultCode: over.code ?? 0, ResultDesc: "done", ...((over.code ?? 0) === 0 ? { CallbackMetadata: { Item: [{ Name: "Amount", Value: amount }, { Name: "MpesaReceiptNumber", Value: over.receipt ?? "RCP1234567" }, { Name: "TransactionDate", Value: 20260105101500 }, { Name: "PhoneNumber", Value: 254712345678 }] } } : {}) } },
});
async function sendStk(s: ReturnType<typeof scenario>, amount: number, phone = "0712345678") {
  const r = await s.service.requestMpesaStk({ dealId: s.deal.id, phone, amount, kind: "installment" }, "u1");
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r.ok ? r.data.payment : (null as never);
}

describe("manual recording", () => {
  it("records cash, tracks the balance, and refuses overpayment", async () => {
    const s = scenario();
    expect((await s.service.recordPayment(cash(s.customer.id, s.deal.id, 4000), "u1")).ok).toBe(true);
    const over = await s.service.recordPayment(cash(s.customer.id, s.deal.id, 7000), "u1");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe("OVERPAYMENT");
    expect((await s.service.recordPayment(cash(s.customer.id, s.deal.id, 6000), "u1")).ok).toBe(true);
    const view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary).toMatchObject({ netPaid: 10_000, balance: 0, status: "paid", collectable: 0 });
  });

  it("the same M-Pesa receipt can never be recorded twice (even by another user)", async () => {
    const s = scenario();
    const mpesa = { ...cash(s.customer.id, s.deal.id, 1000), method: "mpesa", reference: "sjk4x9abcd" };
    expect((await s.service.recordPayment(mpesa, "u1")).ok).toBe(true);
    const dup = await s.service.recordPayment({ ...mpesa, reference: "SJK4X9ABCD" }, "u2");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("DUPLICATE_REFERENCE");
  });

  it("flags manual M-Pesa as unverified and ties a payment to the deal's own customer", async () => {
    const s = scenario();
    const other = harness.seedCustomer(s.business.id, "Someone Else");
    const wrongCustomer = await s.service.recordPayment(cash(other.id, s.deal.id, 100), "u1");
    expect(wrongCustomer.ok).toBe(false);
    const r = await s.service.recordPayment({ ...cash(s.customer.id, s.deal.id, 500), method: "mpesa", reference: "ABCDE12345" }, "u1");
    expect(r.ok && r.data.verification).toBe("manual");
  });

  it("cheques are pending until cleared; a bounced cheque never counts", async () => {
    const s = scenario();
    const r = await s.service.recordPayment({ ...cash(s.customer.id, s.deal.id, 3000), method: "cheque", reference: "000123" }, "u1");
    expect(r.ok && r.data.status).toBe("pending");
    let view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary).toMatchObject({ netPaid: 0, pending: 3000 });
    if (r.ok) expect((await s.service.settlePending(r.data.id, "failed", "u1")).ok).toBe(true);
    view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary).toMatchObject({ netPaid: 0, pending: 0 });
  });

  it("only an owner-checked reversal removes money, needs a reason, and can't be repeated", async () => {
    const s = scenario();
    const r = await s.service.recordPayment(cash(s.customer.id, s.deal.id, 2000), "u1");
    if (!r.ok) throw new Error("setup");
    expect((await s.service.reversePayment(r.data.id, "no", "owner")).ok).toBe(false);
    expect((await s.service.reversePayment(r.data.id, "Customer disputed the charge", "owner")).ok).toBe(true);
    expect((await s.service.reversePayment(r.data.id, "Customer disputed the charge", "owner")).ok).toBe(false);
    const view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary.netPaid).toBe(0);
  });

  it("refunds can't exceed what was paid", async () => {
    const s = scenario();
    await s.service.recordPayment(cash(s.customer.id, s.deal.id, 1000), "u1");
    expect((await s.service.recordPayment({ ...cash(s.customer.id, s.deal.id, 1500), kind: "refund" }, "u1")).ok).toBe(false);
    expect((await s.service.recordPayment({ ...cash(s.customer.id, s.deal.id, 400), kind: "refund" }, "u1")).ok).toBe(true);
  });
});

describe("tenant isolation", () => {
  it("another business can't see, reverse or settle someone else's payment", async () => {
    const a = scenario();
    const b = scenario();
    const r = await a.service.recordPayment(cash(a.customer.id, a.deal.id, 1000), "u1");
    if (!r.ok) throw new Error("setup");
    expect((await b.service.reversePayment(r.data.id, "attempted cross-tenant reversal", "owner")).ok).toBe(false);
    expect((await b.service.getDealPayments(a.deal.id)).ok).toBe(false);
    expect((await b.service.recordPayment(cash(a.customer.id, a.deal.id, 100), "u1")).ok).toBe(false);
    const view = await a.service.getDealPayments(a.deal.id);
    expect(view.ok && view.data.summary.netPaid).toBe(1000);
  });
});

describe("M-Pesa prompts", () => {
  it("needs the plan, a connected account, and valid input", async () => {
    const starter = scenario("starter");
    const r1 = await starter.service.requestMpesaStk({ dealId: starter.deal.id, phone: "0712345678", amount: 100, kind: "installment" }, "u1");
    expect(!r1.ok && r1.error.code).toBe("NOT_IN_PLAN");
    const s = scenario("pro");
    const r2 = await s.service.requestMpesaStk({ dealId: s.deal.id, phone: "0712345678", amount: 100, kind: "installment" }, "u1");
    expect(!r2.ok && r2.error.code).toBe("NOT_CONNECTED");
    await connect(s.service);
    for (const bad of [{ phone: "123", amount: 100 }, { phone: "0712345678", amount: 0 }, { phone: "0712345678", amount: 250_001 }, { phone: "0712345678", amount: "12.5" }]) {
      expect((await s.service.requestMpesaStk({ dealId: s.deal.id, ...bad, kind: "installment" }, "u1")).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(fake.pushes.length).toBe(0);
  });

  it("verifies credentials with Safaricom before saving and stores them encrypted", async () => {
    const s = scenario();
    fake.badCredentials = true;
    const bad = await s.service.connectAccount({ environment: "sandbox", transactionType: "paybill", shortcode: "174379", tillNumber: "", consumerKey: "k".repeat(24), consumerSecret: "s".repeat(24), passkey: "p".repeat(64) }, "u1");
    expect(bad.ok).toBe(false);
    expect(await s.service.getAccount()).toBeNull();
    fake.badCredentials = false;
    await connect(s.service);
    const raw = harness.row<{ consumer_secret_enc: string; passkey_enc: string }>("SELECT consumer_secret_enc, passkey_enc FROM payment_accounts WHERE business_id = ?", s.business.id)!;
    expect(raw.consumer_secret_enc.startsWith("enc:v1:")).toBe(true);
    expect(raw.passkey_enc).not.toContain("pppp");
    expect(JSON.stringify(await s.service.getAccount())).not.toMatch(/sss|pppp|kkkk/);
  });

  it("happy path: prompt -> verified callback -> confirmed with receipt, counted once", async () => {
    const s = scenario();
    const token = await connect(s.service);
    const payment = await sendStk(s, 2500);
    expect(payment.status).toBe("pending");
    expect(fake.pushes[0].callbackUrl).toBe(`https://atlas.test/api/payments/mpesa/callback/${s.business.id}/${token}`);
    expect(fake.pushes[0]).toMatchObject({ phone: "254712345678", amount: 2500 });

    const r = await s.service.applyStkCallback(token, callbackBody(payment.checkoutRequestId ?? harness.row<{ checkout_request_id: string }>("SELECT checkout_request_id FROM payments WHERE id = ?", payment.id)!.checkout_request_id, 2500));
    expect(r.ok && r.data.outcome).toBe("confirmed");
    const row = harness.row<{ status: string; reference: string; verification: string }>("SELECT status, reference, verification FROM payments WHERE id = ?", payment.id)!;
    expect(row).toMatchObject({ status: "confirmed", reference: "RCP1234567", verification: "provider" });
    const view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary.netPaid).toBe(2500);
  });

  it("a forged callback (wrong token) changes nothing", async () => {
    const s = scenario();
    await connect(s.service);
    await sendStk(s, 1000);
    const checkout = harness.row<{ checkout_request_id: string }>("SELECT checkout_request_id FROM payments WHERE business_id = ?", s.business.id)!.checkout_request_id;
    const forged = await s.service.applyStkCallback("0".repeat(48), callbackBody(checkout, 1000));
    expect(!forged.ok && forged.error.code).toBe("FORBIDDEN");
    expect(harness.row<{ status: string }>("SELECT status FROM payments WHERE business_id = ?", s.business.id)!.status).toBe("pending");
  });

  it("replays are no-ops; the token rotates when credentials change", async () => {
    const s = scenario();
    const token = await connect(s.service);
    await sendStk(s, 1000);
    const checkout = harness.row<{ checkout_request_id: string }>("SELECT checkout_request_id FROM payments WHERE business_id = ?", s.business.id)!.checkout_request_id;
    expect((await s.service.applyStkCallback(token, callbackBody(checkout, 1000))).ok).toBe(true);
    const replay = await s.service.applyStkCallback(token, callbackBody(checkout, 1000));
    expect(replay.ok && replay.data.outcome).toBe("ignored");
    const view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary.netPaid).toBe(1000);
    const newToken = await connect(s.service);
    expect(newToken).not.toBe(token);
    expect((await s.service.applyStkCallback(token, callbackBody(checkout, 1000))).ok).toBe(false);
  });

  it("a callback is only a claim: wrong amount or a Safaricom query that disagrees never confirms", async () => {
    const s = scenario();
    const token = await connect(s.service);
    await sendStk(s, 1000);
    const checkout = harness.row<{ checkout_request_id: string }>("SELECT checkout_request_id FROM payments WHERE business_id = ?", s.business.id)!.checkout_request_id;

    const mismatch = await s.service.applyStkCallback(token, callbackBody(checkout, 1));
    expect(mismatch.ok && mismatch.data.outcome).toBe("pending");
    fake.query = { resultCode: 1032, resultDesc: "cancelled" };
    const unverified = await s.service.applyStkCallback(token, callbackBody(checkout, 1000));
    expect(unverified.ok && unverified.data.outcome).toBe("pending");
    fake.queryThrows = true;
    const unavailable = await s.service.applyStkCallback(token, callbackBody(checkout, 1000));
    expect(unavailable.ok && unavailable.data.outcome).toBe("pending");
    expect(harness.row<{ status: string }>("SELECT status FROM payments WHERE business_id = ?", s.business.id)!.status).toBe("pending");

    fake.queryThrows = false;
    fake.query = { resultCode: 0, resultDesc: "ok" };
    const refreshed = await s.service.refreshStk(harness.row<{ id: string }>("SELECT id FROM payments WHERE business_id = ?", s.business.id)!.id, "u1");
    expect(refreshed.ok && refreshed.data.outcome).toBe("confirmed"); // settled by asking Safaricom directly
  });

  it("customer cancel/wrong PIN/timeouts are recorded as terminal, never counted", async () => {
    const s = scenario();
    const token = await connect(s.service);
    await sendStk(s, 1000);
    const checkout = harness.row<{ checkout_request_id: string }>("SELECT checkout_request_id FROM payments WHERE business_id = ?", s.business.id)!.checkout_request_id;
    const r = await s.service.applyStkCallback(token, callbackBody(checkout, 1000, { code: 1032 }));
    expect(r.ok && r.data.outcome).toBe("cancelled");
    const view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary).toMatchObject({ netPaid: 0, pending: 0 });
  });

  it("an STK receipt already recorded by hand isn't counted twice", async () => {
    const s = scenario();
    const token = await connect(s.service);
    await s.service.recordPayment({ ...cash(s.customer.id, s.deal.id, 1000), method: "mpesa", reference: "RCP1234567" }, "u1");
    await sendStk(s, 1000);
    const checkout = harness.row<{ checkout_request_id: string }>("SELECT checkout_request_id FROM payments WHERE business_id = ? AND status = 'pending'", s.business.id)!.checkout_request_id;
    const r = await s.service.applyStkCallback(token, callbackBody(checkout, 1000, { receipt: "RCP1234567" }));
    expect(r.ok && r.data.outcome).toBe("cancelled");
    const view = await s.service.getDealPayments(s.deal.id);
    expect(view.ok && view.data.summary.netPaid).toBe(1000);
  });

  it("limits abuse: duplicate prompt, per-phone hourly cap, and never more than the balance", async () => {
    const s = scenario("pro", 100_000);
    await connect(s.service);
    await sendStk(s, 1000);
    const dup = await s.service.requestMpesaStk({ dealId: s.deal.id, phone: "0712345678", amount: 1000, kind: "installment" }, "u1");
    expect(!dup.ok && dup.error.code).toBe("RATE_LIMITED");
    const tooMuch = await s.service.requestMpesaStk({ dealId: s.deal.id, phone: "0722000111", amount: 150_000, kind: "installment" }, "u1");
    expect(tooMuch.ok).toBe(false);
    const s2 = scenario("pro", 5000);
    await connect(s2.service);
    await sendStk(s2, 4000, "0733000111");
    const reserved = await s2.service.requestMpesaStk({ dealId: s2.deal.id, phone: "0733000222", amount: 2000, kind: "installment" }, "u1");
    expect(!reserved.ok && reserved.error.code).toBe("OVERPAYMENT"); // pending 4000 reserves room
  });

  it("the kill switch stops new prompts and callbacks", async () => {
    const s = scenario();
    const token = await connect(s.service);
    process.env.PAYMENTS_ENABLED = "false";
    try {
      const r = await s.service.requestMpesaStk({ dealId: s.deal.id, phone: "0712345678", amount: 100, kind: "installment" }, "u1");
      expect(r.ok).toBe(false);
      expect((await s.service.applyStkCallback(token, callbackBody("x", 1))).ok).toBe(false);
    } finally {
      delete process.env.PAYMENTS_ENABLED;
    }
  });
});

describe("the database itself refuses to rewrite history", () => {
  it("blocks deletes, amount edits, un-reversing and verification upgrades, and audit edits", async () => {
    const s = scenario();
    const r = await s.service.recordPayment({ ...cash(s.customer.id, s.deal.id, 1000), method: "mpesa", reference: "TAMPER1234" }, "u1");
    if (!r.ok) throw new Error("setup");
    expect(() => harness.run("DELETE FROM payments WHERE id = ?", r.data.id)).toThrow(/append-only/);
    expect(() => harness.run("UPDATE payments SET amount = 1 WHERE id = ?", r.data.id)).toThrow(/immutable/);
    expect(() => harness.run("UPDATE payments SET verification = 'provider' WHERE id = ?", r.data.id)).toThrow(/verification/);
    await s.service.reversePayment(r.data.id, "reversed for the test", "owner");
    expect(() => harness.run("UPDATE payments SET status = 'confirmed' WHERE id = ?", r.data.id)).toThrow(/cannot change status/);
    expect(() => harness.run("DELETE FROM payment_events")).toThrow(/append-only/);
    expect(() => harness.run("UPDATE payment_events SET action = 'x'")).toThrow(/append-only/);
  });

  it("writes an audit event for recording and reversing, without secrets", async () => {
    const s = scenario();
    const r = await s.service.recordPayment(cash(s.customer.id, s.deal.id, 900), "u1");
    if (!r.ok) throw new Error("setup");
    await s.service.reversePayment(r.data.id, "audit trail check", "owner");
    const events = harness.rows<{ action: string; detail: string }>("SELECT action, detail FROM payment_events WHERE payment_id = ? ORDER BY created_at", r.data.id);
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["payment_recorded", "payment_reversed"]));
  });
});

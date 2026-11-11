import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../test-support/action-test-harness";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";
import { DarajaError, type MpesaClient, type StkPushRequest } from "../../payments/mpesa/daraja-client";
import type { BillingService as BillingServiceType } from "../service/billing-service";

class FakeMpesa implements MpesaClient {
  pushes: StkPushRequest[] = [];
  query: { resultCode: number | null; resultDesc: string } = { resultCode: 0, resultDesc: "ok" };
  queryThrows = false;
  pushThrows = false;
  private n = 0;
  async verifyCredentials() {}
  async stkPush(request: StkPushRequest) {
    if (this.pushThrows) throw new DarajaError("M-Pesa declined the request.", "rejected");
    this.pushes.push(request);
    this.n += 1;
    return { merchantRequestId: `mr_${this.n}`, checkoutRequestId: `ws_CO_${randomBytes(4).toString("hex")}`, customerMessage: "ok" };
  }
  async stkQuery() {
    if (this.queryThrows) throw new DarajaError("down", "network");
    return this.query;
  }
}

const harness = new ActionTestHarness();
const TOKEN = randomBytes(24).toString("hex");
const ENV = {
  MPESA_PLATFORM_ENV: "sandbox",
  MPESA_PLATFORM_SHORTCODE: "174379",
  MPESA_PLATFORM_CONSUMER_KEY: "k".repeat(24),
  MPESA_PLATFORM_CONSUMER_SECRET: "s".repeat(24),
  MPESA_PLATFORM_PASSKEY: "p".repeat(64),
  BILLING_CALLBACK_TOKEN: TOKEN,
  BILLING_CRON_SECRET: randomBytes(32).toString("hex"),
  PUBLIC_BASE_URL: "https://atlas.test",
};
let BillingService: typeof BillingServiceType;
let fake: FakeMpesa;
let clock: Date;
const svc = (env: Record<string, string | undefined> = ENV) => new BillingService({ mpesaFactory: () => fake, env, now: () => clock });

beforeAll(async () => {
  await harness.setup();
  BillingService = (await import("../service/billing-service")).BillingService;
});
afterAll(() => harness.teardown());
beforeEach(() => {
  // The cycle is global by design, so isolate tests from each other: close leftover open invoices and stop old test
  // subscriptions from renewing. (Invoices can't be deleted: the append-only triggers forbid it, which is the point.)
  harness.run("UPDATE billing_invoices SET status = 'void' WHERE status = 'open'");
  harness.run("UPDATE subscriptions SET current_period_end = NULL");
  resetRateLimitsForTests();
  fake = new FakeMpesa();
  clock = new Date("2026-06-01T09:00:00.000Z");
});

const sub = (businessId: string) =>
  harness.row<{ plan: string; status: string; trial_ends_at: string | null; current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: number }>(
    "SELECT plan, status, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end FROM subscriptions WHERE business_id = ?",
    businessId
  )!;
const invoices = (businessId: string) => harness.rows<{ id: string; status: string; kind: string; amount: number; plan: string; attempts: number; checkout_request_id: string | null; receipt: string | null; payment_state: string; period_start: string; period_end: string }>("SELECT * FROM billing_invoices WHERE business_id = ? ORDER BY created_at", businessId);
const open = (businessId: string) => invoices(businessId).find((i) => i.status === "open")!;
const cb = (checkoutId: string, amount: number, over: { code?: number; receipt?: string } = {}) => ({
  Body: { stkCallback: { MerchantRequestID: "mr", CheckoutRequestID: checkoutId, ResultCode: over.code ?? 0, ResultDesc: "d", ...((over.code ?? 0) === 0 ? { CallbackMetadata: { Item: [{ Name: "Amount", Value: amount }, { Name: "MpesaReceiptNumber", Value: over.receipt ?? `R${randomBytes(5).toString("hex").toUpperCase().slice(0, 9)}` }, { Name: "PhoneNumber", Value: 254712345678 }] } } : {}) } },
});
const starter = () => harness.seedBusiness(`Biz ${Math.random()}`, "starter");

describe("configuration", () => {
  it("billing is off unless fully configured, and the cycle skips", async () => {
    const business = starter();
    for (const broken of [{}, { ...ENV, BILLING_CALLBACK_TOKEN: "short" }, { ...ENV, MPESA_PLATFORM_ENV: "staging" }, { ...ENV, PUBLIC_BASE_URL: "http://insecure" }, { ...ENV, BILLING_ENABLED: "false" }]) {
      const s = svc(broken as Record<string, string>);
      expect(s.isEnabled()).toBe(false);
      expect((await s.startUpgrade(business.id, "growth", "0712345678", "u1")).ok).toBe(false);
      expect((await s.runCycle()).skipped).toBe(true);
    }
  });
});

describe("paying for a plan", () => {
  it("takes the price from the server catalog and only accepts real paid plans and valid phones", async () => {
    const business = starter();
    expect((await svc().startUpgrade(business.id, "starter", "0712345678", "u1")).ok).toBe(false);
    expect((await svc().startUpgrade(business.id, "enterprise", "0712345678", "u1")).ok).toBe(false);
    expect((await svc().startUpgrade(business.id, { amount: 1 }, "0712345678", "u1")).ok).toBe(false);
    expect((await svc().startUpgrade(business.id, "growth", "12345", "u1")).ok).toBe(false);
    expect(fake.pushes.length).toBe(0);

    expect((await svc().startUpgrade(business.id, "growth", "0712345678", "u1")).ok).toBe(true);
    expect(fake.pushes[0]).toMatchObject({ amount: 5000, phone: "254712345678" });
    expect(fake.pushes[0].callbackUrl).toBe(`https://atlas.test/api/billing/mpesa/callback/${TOKEN}`);
    expect(open(business.id)).toMatchObject({ plan: "growth", amount: 5000, kind: "upgrade" });

    const pro = starter();
    await svc().startUpgrade(pro.id, "pro", "0722000111", "u1");
    expect(open(pro.id).amount).toBe(13000);
  });

  it("a verified callback activates the plan atomically (period, status, trial consumed); replays do nothing", async () => {
    const business = starter();
    await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
    const invoice = open(business.id);
    const r = await svc().applyCallback(TOKEN, cb(invoice.checkout_request_id!, 5000));
    expect(r.ok && r.data.outcome).toBe("paid");
    expect(sub(business.id)).toMatchObject({ plan: "growth", status: "active", trial_ends_at: null, cancel_at_period_end: 0 });
    expect(sub(business.id).current_period_end).toBe("2026-07-01T09:00:00.000Z");
    expect(invoices(business.id)[0]).toMatchObject({ status: "paid" });
    expect(invoices(business.id)[0].receipt).toMatch(/^R[0-9A-F]{9}$/);

    const before = sub(business.id);
    const replay = await svc().applyCallback(TOKEN, cb(invoice.checkout_request_id!, 5000));
    expect(replay.ok && replay.data.outcome).toBe("ignored");
    expect(sub(business.id)).toEqual(before);
  });

  it("upgrading out of a trial ends the trial and starts the paid period", async () => {
    const business = harness.seedBusiness("Trial Biz", "pro");
    harness.run("UPDATE subscriptions SET status = 'trialing', trial_ends_at = ? WHERE business_id = ?", "2026-06-10T00:00:00.000Z", business.id);
    await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
    await svc().applyCallback(TOKEN, cb(open(business.id).checkout_request_id!, 5000));
    expect(sub(business.id)).toMatchObject({ plan: "growth", status: "active", trial_ends_at: null });
  });

  it("forged tokens, wrong amounts, unverifiable or failed payments never activate anything", async () => {
    const business = starter();
    await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
    const checkout = open(business.id).checkout_request_id!;

    const forged = await svc().applyCallback("f".repeat(48), cb(checkout, 5000));
    expect(!forged.ok && forged.error.code).toBe("FORBIDDEN");
    expect((await svc().applyCallback(TOKEN, cb(checkout, 1))).ok && true).toBe(true);
    fake.query = { resultCode: 1032, resultDesc: "no" };
    await svc().applyCallback(TOKEN, cb(checkout, 5000));
    fake.queryThrows = true;
    await svc().applyCallback(TOKEN, cb(checkout, 5000));
    expect(sub(business.id)).toMatchObject({ plan: "starter" });
    expect(open(business.id).status).toBe("open");

    fake.queryThrows = false;
    const failed = await svc().applyCallback(TOKEN, cb(checkout, 5000, { code: 2001 }));
    expect(failed.ok && failed.data.outcome).toBe("failed");
    expect(open(business.id)).toMatchObject({ status: "open", payment_state: "failed" });
    expect(sub(business.id).plan).toBe("starter");
  });

  it("one M-Pesa receipt can pay only one invoice", async () => {
    const a = starter();
    const b = starter();
    await svc().startUpgrade(a.id, "growth", "0712345678", "u1");
    await svc().startUpgrade(b.id, "growth", "0722000111", "u1");
    const first = await svc().applyCallback(TOKEN, cb(open(a.id).checkout_request_id!, 5000, { receipt: "SAME123456" }));
    expect(first.ok && first.data.outcome).toBe("paid");
    const second = await svc().applyCallback(TOKEN, cb(open(b.id).checkout_request_id!, 5000, { receipt: "SAME123456" }));
    expect(second.ok && second.data.outcome).toBe("ignored");
    expect(sub(b.id).plan).toBe("starter");
    expect(open(b.id).status).toBe("open");
  });

  it("a second upgrade supersedes the first; only one invoice is ever open", async () => {
    const business = starter();
    await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
    clock = new Date(clock.getTime() + 60 * 60_000);
    await svc().startUpgrade(business.id, "pro", "0712345678", "u1");
    const all = invoices(business.id);
    expect(all.filter((i) => i.status === "open").length).toBe(1);
    expect(all.filter((i) => i.status === "void").length).toBe(1);
    expect(open(business.id).plan).toBe("pro");
  });

  it("a failed prompt is reported honestly and leaves nothing charged", async () => {
    const business = starter();
    fake.pushThrows = true;
    const r = await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
    expect(r.ok).toBe(false);
    expect(open(business.id).payment_state).toBe("failed");
    expect(sub(business.id).plan).toBe("starter");
  });

  it("throttles prompts per phone", async () => {
    const business = starter();
    for (let i = 0; i < 3; i++) {
      await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
      clock = new Date(clock.getTime() + 1000);
    }
    const blocked = await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
    expect(!blocked.ok && blocked.error.code).toBe("RATE_LIMITED");
  });
});

describe("the automated renewal cycle", () => {
  function paidGrowth(periodEnd: Date, extra: { cancel?: boolean; phone?: string | null } = {}) {
    const business = harness.seedBusiness(`Renew ${Math.random()}`, "growth");
    harness.run(
      "UPDATE subscriptions SET current_period_start = ?, current_period_end = ?, cancel_at_period_end = ?, provider = 'mpesa', provider_customer_id = ? WHERE business_id = ?",
      "2026-05-01T09:00:00.000Z",
      periodEnd.toISOString(),
      extra.cancel ? 1 : 0,
      extra.phone === undefined ? "254712345678" : extra.phone,
      business.id
    );
    return business;
  }

  it("invoices 3 days ahead, prompts once, then walks reminders -> past due -> downgrade, without ever double-prompting", async () => {
    fake.query = { resultCode: null, resultDesc: "processing" };
    const periodEnd = new Date("2026-06-03T09:00:00.000Z"); // due in 2 days
    const business = paidGrowth(periodEnd);

    const run1 = await svc().runCycle();
    expect(run1).toMatchObject({ invoicesCreated: 1, promptsSent: 1 });
    expect(open(business.id)).toMatchObject({ kind: "renewal", amount: 5000, period_start: periodEnd.toISOString(), period_end: "2026-07-03T09:00:00.000Z" });

    const run2 = await svc().runCycle(); // immediately again: idempotent
    expect(run2).toMatchObject({ invoicesCreated: 0, promptsSent: 0 });
    expect(fake.pushes.length).toBe(1);

    clock = new Date("2026-06-03T10:00:00.000Z"); // an hour past due
    const run3 = await svc().runCycle();
    expect(run3).toMatchObject({ pastDue: 1, promptsSent: 1 });
    expect(sub(business.id).status).toBe("past_due"); // access continues in grace

    clock = new Date("2026-06-11T10:00:00.000Z"); // 8 days past due
    const run4 = await svc().runCycle();
    expect(run4.downgraded).toBe(1);
    expect(sub(business.id).status).toBe("cancelled"); // resolves to free Starter; nothing deleted
    expect(invoices(business.id)[0].status).toBe("uncollectible");
    expect(fake.pushes.length).toBe(2);
    expect((await svc().runCycle()).downgraded).toBe(0);
  });

  it("a renewal paid on time extends the period contiguously and stops the nagging", async () => {
    fake.query = { resultCode: null, resultDesc: "processing" };
    const periodEnd = new Date("2026-06-03T09:00:00.000Z");
    const business = paidGrowth(periodEnd);
    await svc().runCycle();
    fake.query = { resultCode: 0, resultDesc: "ok" }; // Safaricom confirms the payment when asked
    await svc().applyCallback(TOKEN, cb(open(business.id).checkout_request_id!, 5000, { receipt: "RENEW12345" }));
    expect(sub(business.id)).toMatchObject({ plan: "growth", status: "active", current_period_start: periodEnd.toISOString(), current_period_end: "2026-07-03T09:00:00.000Z" });

    clock = new Date("2026-06-20T00:00:00.000Z");
    const next = await svc().runCycle();
    expect(next).toMatchObject({ invoicesCreated: 0, promptsSent: 0 }); // next renewal isn't within 3 days yet
    expect(fake.pushes.length).toBe(1);
  });

  it("paying late during grace restores the plan; a missed callback is healed by asking Safaricom", async () => {
    fake.query = { resultCode: null, resultDesc: "processing" };
    const business = paidGrowth(new Date("2026-06-03T09:00:00.000Z"));
    await svc().runCycle();
    clock = new Date("2026-06-05T09:00:00.000Z");
    await svc().runCycle();
    expect(sub(business.id).status).toBe("past_due");
    fake.query = { resultCode: 0, resultDesc: "ok" }; // customer paid, but Safaricom's callback never reached us
    clock = new Date("2026-06-05T10:00:00.000Z");
    const run = await svc().runCycle();
    expect(run.settled).toBe(1);
    expect(sub(business.id)).toMatchObject({ status: "active", current_period_end: "2026-07-03T09:00:00.000Z" });
  });

  it("leaves alone: cancelled-at-period-end, no period date (manual plans), free Starter, and businesses with no phone get an invoice but no prompt", async () => {
    const cancelling = paidGrowth(new Date("2026-06-03T09:00:00.000Z"), { cancel: true });
    const manual = harness.seedBusiness("Manual", "pro");
    const free = starter();
    const noPhone = paidGrowth(new Date("2026-06-03T09:00:00.000Z"), { phone: null });
    const r = await svc().runCycle();
    expect(invoices(cancelling.id).length).toBe(0);
    expect(invoices(manual.id).length).toBe(0);
    expect(invoices(free.id).length).toBe(0);
    expect(invoices(noPhone.id).length).toBe(1);
    expect(fake.pushes.some((p) => p.phone === "")).toBe(false);
    expect(r.errors).toBe(0);
  });

  it("an unpaid upgrade attempt lapses after 24h without touching the subscription", async () => {
    fake.query = { resultCode: null, resultDesc: "processing" };
    const business = starter();
    await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
    clock = new Date(clock.getTime() + 25 * 3_600_000);
    const r = await svc().runCycle();
    expect(r.voided).toBe(1);
    expect(sub(business.id)).toMatchObject({ plan: "starter", status: "active" });
  });
});

describe("the database guards the invoices", () => {
  it("blocks edits to amount/plan, deletes, reopening, and a second open invoice", async () => {
    const business = starter();
    await svc().startUpgrade(business.id, "growth", "0712345678", "u1");
    const invoice = open(business.id);
    expect(() => harness.run("UPDATE billing_invoices SET amount = 1 WHERE id = ?", invoice.id)).toThrow(/immutable/);
    expect(() => harness.run("UPDATE billing_invoices SET plan = 'pro' WHERE id = ?", invoice.id)).toThrow(/immutable/);
    expect(() => harness.run("DELETE FROM billing_invoices WHERE id = ?", invoice.id)).toThrow(/append-only/);
    expect(() =>
      harness.run("INSERT INTO billing_invoices (id, business_id, plan, amount, kind, period_start, period_end, due_at) VALUES ('x', ?, 'pro', 13000, 'upgrade', 'a', 'b', 'c')", business.id)
    ).toThrow(/UNIQUE/);
    await svc().applyCallback(TOKEN, cb(invoice.checkout_request_id!, 5000));
    expect(() => harness.run("UPDATE billing_invoices SET status = 'open' WHERE id = ?", invoice.id)).toThrow(/cannot change status/);
  });
});

describe("cron endpoint", () => {
  it("is disabled without a strong secret, rejects wrong secrets, and runs with the right one", async () => {
    const { POST } = await import("@/app/api/billing/cron/route");
    const call = (auth?: string) => POST(new Request("http://x/api/billing/cron", { method: "POST", headers: { ...(auth ? { authorization: auth } : {}), "x-forwarded-for": `9.9.9.${Math.floor(Math.random() * 250)}` } }));
    delete process.env.BILLING_CRON_SECRET;
    expect((await call("Bearer anything")).status).toBe(404);
    process.env.BILLING_CRON_SECRET = "short";
    expect((await call("Bearer short")).status).toBe(404);
    const secret = randomBytes(32).toString("hex");
    process.env.BILLING_CRON_SECRET = secret;
    try {
      expect((await call()).status).toBe(401);
      expect((await call("Bearer " + "0".repeat(64))).status).toBe(401);
      const ok = await call(`Bearer ${secret}`);
      expect(ok.status).toBe(200);
      expect(Object.keys(await ok.json()).sort()).toEqual(["downgraded", "errors", "invoicesCreated", "pastDue", "promptsSent", "settled", "skipped", "voided"]);
    } finally {
      delete process.env.BILLING_CRON_SECRET;
    }
  });
});

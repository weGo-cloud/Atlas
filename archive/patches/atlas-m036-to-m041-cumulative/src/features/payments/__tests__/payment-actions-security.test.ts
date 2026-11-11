import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../test-support/action-test-harness";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

const harness = new ActionTestHarness();
let actions: typeof import("../actions/payment-actions");
const creds = { environment: "sandbox", transactionType: "paybill", shortcode: "174379", tillNumber: "", consumerKey: "k".repeat(24), consumerSecret: "s".repeat(24), passkey: "p".repeat(64) };
const account = (businessId: string) => harness.row<{ business_id: string }>("SELECT business_id FROM payment_accounts WHERE business_id = ?", businessId);

beforeAll(async () => {
  process.env.ATLAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  await harness.setup();
  actions = await import("../actions/payment-actions");
});
afterAll(() => {
  harness.teardown();
  delete process.env.ATLAS_ENCRYPTION_KEY;
});
beforeEach(() => resetRateLimitsForTests());

describe("changing where customer money goes needs the owner AND their password", () => {
  it("staff can't connect or disconnect an M-Pesa account", async () => {
    const business = harness.seedBusiness("Staff Shop", "pro");
    await harness.signIn(await harness.seedUser(business.id, "staff", "staff@shop.test"));
    const r = await actions.connectMpesaAccountAction({ ...creds, currentPassword: "password123" });
    expect(!r.ok && r.error.message).toMatch(/owner/i);
    expect(account(business.id)).toBeUndefined();
    const d = await actions.disconnectMpesaAccountAction("password123");
    expect(d.ok).toBe(false);
  });

  it("a signed-in owner with the wrong password is refused and nothing is stored", async () => {
    const business = harness.seedBusiness("Owner Shop", "pro");
    await harness.signIn(await harness.seedUser(business.id, "owner", "owner@shop.test"));
    for (const bad of ["", "wrong-password", undefined, 12345, "x".repeat(500)]) {
      const r = await actions.connectMpesaAccountAction({ ...creds, currentPassword: bad });
      expect(!r.ok && r.error.message).toMatch(/password/i);
    }
    expect(account(business.id)).toBeUndefined();
  });

  it("guessing the password is throttled: after 5 tries even the right password is refused", async () => {
    const business = harness.seedBusiness("Throttle Shop", "pro");
    await harness.signIn(await harness.seedUser(business.id, "owner", "owner2@shop.test"));
    for (let i = 0; i < 5; i++) await actions.connectMpesaAccountAction({ ...creds, currentPassword: `guess-${i}` });
    const locked = await actions.connectMpesaAccountAction({ ...creds, currentPassword: "password123" });
    expect(!locked.ok && locked.error.message).toMatch(/password/i);
  });

  it("with the right password the request proceeds past the gate (and is then verified with Safaricom before anything is saved)", async () => {
    const business = harness.seedBusiness("Right Shop", "pro");
    await harness.signIn(await harness.seedUser(business.id, "owner", "owner3@shop.test"));
    const r = await actions.connectMpesaAccountAction({ ...creds, currentPassword: "password123" });
    // No network in tests: the credential check against Safaricom fails, so NOTHING may be stored. The message is not the password one.
    expect(!r.ok && r.error.message).not.toMatch(/password wasn't accepted/i);
    expect(account(business.id)).toBeUndefined();
  });

  it("a reversal is owner-only", async () => {
    const business = harness.seedBusiness("Reverse Shop", "pro");
    await harness.signIn(await harness.seedUser(business.id, "staff", "staff2@shop.test"));
    const r = await actions.reversePaymentAction("pay_whatever123", "trying to hide a payment", "deal_x");
    expect(!r.ok && r.error.message).toMatch(/owner/i);
  });
});

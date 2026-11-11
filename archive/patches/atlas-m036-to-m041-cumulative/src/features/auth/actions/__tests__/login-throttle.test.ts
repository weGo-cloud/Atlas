import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../../test-support/action-test-harness";
import { __setTestHeaders } from "../../../../test-support/vitest.setup";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

const harness = new ActionTestHarness();
let signInAction: (email: string, password: string) => Promise<{ ok: boolean; error?: { code: string; message: string } }>;

beforeAll(async () => {
  await harness.setup();
  signInAction = (await import("../auth-actions")).signInAction;
});
afterAll(() => harness.teardown());
beforeEach(async () => {
  harness.reset();
  resetRateLimitsForTests();
  __setTestHeaders({ "x-forwarded-for": "203.0.113.7" });
  const business = harness.seedBusiness("Login Shop");
  await harness.seedUser(business.id, "owner", "owner@shop.test");
});

describe("login throttling", () => {
  it("locks an account after 5 failures — even the correct password is then refused", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await signInAction("owner@shop.test", "wrong-password");
      expect(result.error?.code).toBe("INVALID_CREDENTIALS");
    }
    const locked = await signInAction("owner@shop.test", "password123");
    expect(locked.ok).toBe(false);
    expect(locked.error?.code).toBe("RATE_LIMITED");
    expect(locked.error?.message).toMatch(/try again in \d+ minute/i);
    expect(harness.rows("SELECT id FROM sessions")).toHaveLength(0); // no session was created
  });

  it("email matching is case/whitespace-insensitive (can't dodge the lock by retyping)", async () => {
    for (let i = 0; i < 5; i++) await signInAction("owner@shop.test", "nope");
    expect((await signInAction("  OWNER@Shop.test ", "password123")).error?.code).toBe("RATE_LIMITED");
  });

  it("a successful sign-in clears that account's failure window", async () => {
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) await signInAction("owner@shop.test", "nope");
      expect((await signInAction("owner@shop.test", "password123")).ok).toBe(true);
    }
  });

  it("one IP spraying many accounts is cut off after 20 attempts, other IPs are unaffected", async () => {
    for (let i = 0; i < 20; i++) expect((await signInAction(`ghost${i}@shop.test`, "x")).error?.code).toBe("INVALID_CREDENTIALS");
    expect((await signInAction("owner@shop.test", "password123")).error?.code).toBe("RATE_LIMITED");
    __setTestHeaders({ "x-forwarded-for": "198.51.100.9" });
    expect((await signInAction("owner@shop.test", "password123")).ok).toBe(true);
  });

  it("different accounts have independent windows", async () => {
    for (let i = 0; i < 5; i++) await signInAction("owner@shop.test", "nope");
    const business = harness.seedBusiness("Other Shop");
    await harness.seedUser(business.id, "owner", "other@shop.test");
    expect((await signInAction("other@shop.test", "password123")).ok).toBe(true);
  });

  it("unknown email and wrong password are indistinguishable, in message and in time", async () => {
    const unknown = await signInAction("nobody@shop.test", "password123");
    const wrong = await signInAction("owner@shop.test", "not-the-password");
    expect(unknown.error).toEqual(wrong.error);

    const time = async (email: string) => {
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        resetRateLimitsForTests();
        const start = performance.now();
        await signInAction(email, "not-the-password");
        samples.push(performance.now() - start);
      }
      return samples.sort((a, b) => a - b)[1];
    };
    const known = await time("owner@shop.test");
    const missing = await time("nobody@shop.test");
    // Without the timing equalizer an unknown email skips scrypt entirely (~1ms vs tens of ms).
    expect(missing).toBeGreaterThan(known * 0.4);
  });
});

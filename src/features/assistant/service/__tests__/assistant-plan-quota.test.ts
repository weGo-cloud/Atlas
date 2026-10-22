import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../../test-support/action-test-harness";

const harness = new ActionTestHarness();
let getAssistantService: typeof import("../assistant-service").getAssistantService;

beforeAll(async () => {
  await harness.setup();
  getAssistantService = (await import("../assistant-service")).getAssistantService;
});
afterAll(() => harness.teardown());
beforeEach(() => harness.reset());
afterEach(() => {
  delete process.env.AI_DAILY_CAP_PER_BUSINESS;
});

function furnitureBusiness(plan: "starter" | "growth" | "pro") {
  const business = harness.seedBusiness(`Furn ${plan}`, plan);
  harness.run("UPDATE businesses SET vertical = 'furniture' WHERE id = ?", business.id);
  harness.run("INSERT INTO assistant_settings (business_id, assistant_enabled) VALUES (?, 1)", business.id);
  return business.id;
}

const llm = { complete: async () => ({ content: [{ type: "text" as const, text: "Hi!" }], stopReason: "end_turn" as const }) };

describe("assistant plan gate and daily allowance", () => {
  it("Starter: not in plan — no availability, no AI call", async () => {
    const id = furnitureBusiness("starter");
    const service = getAssistantService(id, { llm });
    expect(await service.getAvailability()).toEqual({ available: false, reason: "not_in_plan" });
    expect(await service.handleCustomerMessage({ channel: "whatsapp", customerKey: "254700000001", text: "hi" })).toEqual({ ok: false, reason: "not_in_plan" });
  });

  it("Growth and Pro get their plan's daily cap", async () => {
    expect(await getAssistantService(furnitureBusiness("growth"), { llm }).getAllowance()).toEqual({ allowed: true, dailyCap: 150 });
    expect(await getAssistantService(furnitureBusiness("pro"), { llm }).getAllowance()).toEqual({ allowed: true, dailyCap: 500 });
  });

  it("a running trial gets the tighter trial cap; an elapsed trial falls back to Starter (no AI)", async () => {
    const trial = furnitureBusiness("pro");
    harness.run("UPDATE subscriptions SET status = 'trialing', trial_ends_at = ? WHERE business_id = ?", new Date(Date.now() + 86_400_000).toISOString(), trial);
    expect(await getAssistantService(trial, { llm }).getAllowance()).toEqual({ allowed: true, dailyCap: 60 });

    const expired = furnitureBusiness("pro");
    harness.run("UPDATE subscriptions SET status = 'trialing', trial_ends_at = ? WHERE business_id = ?", new Date(Date.now() - 1000).toISOString(), expired);
    expect((await getAssistantService(expired, { llm }).getAllowance()).allowed).toBe(false);
  });

  it("the operator ceiling can lower but never raise the plan allowance", async () => {
    const id = furnitureBusiness("pro");
    process.env.AI_DAILY_CAP_PER_BUSINESS = "10";
    expect((await getAssistantService(id, { llm }).getAllowance()).dailyCap).toBe(10);
    process.env.AI_DAILY_CAP_PER_BUSINESS = "9999";
    expect((await getAssistantService(id, { llm }).getAllowance()).dailyCap).toBe(500);
  });

  it("answers up to the cap, then limit_reached; usage meter reflects it", async () => {
    const id = furnitureBusiness("growth");
    process.env.AI_DAILY_CAP_PER_BUSINESS = "2";
    const service = getAssistantService(id, { llm });
    const send = (n: number) => service.handleCustomerMessage({ channel: "whatsapp", customerKey: `2547000000${n}`, text: "hi" });
    expect((await send(1)).ok).toBe(true);
    expect((await send(2)).ok).toBe(true);
    expect(await send(3)).toEqual({ ok: false, reason: "limit_reached" });
    expect(await service.getUsageToday()).toMatchObject({ used: 2, cap: 2 });
  });
});

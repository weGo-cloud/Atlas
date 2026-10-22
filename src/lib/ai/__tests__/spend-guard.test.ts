import { randomBytes } from "node:crypto";

import Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionTestHarness } from "../../../test-support/action-test-harness";

const harness = new ActionTestHarness();
let guard: typeof import("../spend-guard");

beforeAll(async () => {
  await harness.setup();
  guard = await import("../spend-guard");
});
afterAll(() => harness.teardown());
beforeEach(() => harness.reset());
afterEach(() => {
  delete process.env.AI_DAILY_CAP_GLOBAL;
  delete process.env.AI_DAILY_CAP_PER_BUSINESS;
  vi.unstubAllGlobals();
});

describe("reserveAiCall", () => {
  it("allows exactly `cap` calls per scope per day, then refuses", async () => {
    for (let i = 0; i < 3; i++) expect(await guard.reserveAiCall("global", 3)).toBe(true);
    expect(await guard.reserveAiCall("global", 3)).toBe(false);
    expect(await guard.reserveAiCall("global", 3)).toBe(false);
    expect(harness.row<{ calls: number }>("SELECT calls FROM ai_usage_counters WHERE scope = 'global'")?.calls).toBe(3); // refusals don't inflate the count
  });

  it("scopes and days are independent", async () => {
    const day1 = new Date("2026-10-19T10:00:00Z");
    const day2 = new Date("2026-10-20T00:00:01Z");
    expect(await guard.reserveAiCall("biz:a", 1, day1)).toBe(true);
    expect(await guard.reserveAiCall("biz:a", 1, day1)).toBe(false);
    expect(await guard.reserveAiCall("biz:b", 1, day1)).toBe(true); // another business
    expect(await guard.reserveAiCall("biz:a", 1, day2)).toBe(true); // next UTC day resets
  });

  it("a cap of 0 disables AI entirely", async () => {
    expect(await guard.reserveAiCall("global", 0)).toBe(false);
  });

  it("never overshoots when several connections race for the last slots", () => {
    const dbPath = process.env.DATABASE_URL!.slice(5);
    const connections = [new Database(dbPath), new Database(dbPath), new Database(dbPath)];
    try {
      const stmt = `INSERT INTO ai_usage_counters (scope, day, calls) VALUES ('race', '2026-10-19', 1)
        ON CONFLICT (scope, day) DO UPDATE SET calls = calls + 1 WHERE calls < 10 RETURNING calls`;
      let granted = 0;
      for (let i = 0; i < 40; i++) {
        if (connections[i % 3].prepare(stmt).all().length > 0) granted += 1;
      }
      expect(granted).toBe(10);
      expect(harness.row<{ calls: number }>("SELECT calls FROM ai_usage_counters WHERE scope = 'race'")?.calls).toBe(10);
    } finally {
      connections.forEach((c) => c.close());
    }
  });

  it("reads caps from env, falling back to safe defaults on bad values", () => {
    expect(guard.globalDailyCap()).toBe(guard.DEFAULT_GLOBAL_DAILY_CAP);
    process.env.AI_DAILY_CAP_GLOBAL = "7";
    expect(guard.globalDailyCap()).toBe(7);
    process.env.AI_DAILY_CAP_GLOBAL = "lots";
    expect(guard.globalDailyCap()).toBe(guard.DEFAULT_GLOBAL_DAILY_CAP);
    process.env.AI_DAILY_CAP_GLOBAL = "-5";
    expect(guard.globalDailyCap()).toBe(guard.DEFAULT_GLOBAL_DAILY_CAP);
  });
});

describe("the guard is actually wired into every outbound Anthropic call (fail closed)", () => {
  function stubAnthropic() {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "hello" }], stop_reason: "end_turn" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const request = { system: "s", messages: [{ role: "user" as const, content: "hi" }], tools: [], maxTokens: 50 };

  it("assistant client", async () => {
    process.env.AI_DAILY_CAP_GLOBAL = "1";
    const fetchMock = stubAnthropic();
    const { AnthropicLlmClient } = await import("../../../features/assistant/llm/anthropic-llm-client");
    const client = new AnthropicLlmClient("sk-test");
    await expect(client.complete(request)).resolves.toBeTruthy();
    await expect(client.complete(request)).rejects.toThrow(/daily limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the second call never left the server
  });

  it("everest client", async () => {
    process.env.AI_DAILY_CAP_GLOBAL = "1";
    const fetchMock = stubAnthropic();
    const { AnthropicLlmClient } = await import("../../../features/everest/llm/anthropic-llm-client");
    const client = new AnthropicLlmClient("sk-test");
    await expect(client.complete(request)).resolves.toBeTruthy();
    await expect(client.complete(request)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("per-business cap on public customer messages", () => {
  it("stops one business at its cap without affecting another", async () => {
    process.env.AI_DAILY_CAP_PER_BUSINESS = "2";
    const a = harness.seedBusiness("Furn A");
    const b = harness.seedBusiness("Furn B");
    for (const id of [a.id, b.id]) {
      harness.run("UPDATE businesses SET vertical = 'furniture' WHERE id = ?", id);
      harness.run("INSERT INTO assistant_settings (business_id, assistant_enabled) VALUES (?, 1)", id);
    }
    const llm = { complete: vi.fn(async () => ({ content: [{ type: "text" as const, text: "Welcome!" }], stopReason: "end_turn" as const })) };
    const { getAssistantService } = await import("../../../features/assistant/service/assistant-service");
    const send = (businessId: string, n: number) =>
      getAssistantService(businessId, { llm }).handleCustomerMessage({ channel: "website_chat", customerKey: `web_${randomBytes(4).toString("hex")}_${n}`, text: "Hi" });

    expect((await send(a.id, 1)).ok).toBe(true);
    expect((await send(a.id, 2)).ok).toBe(true);
    const blocked = await send(a.id, 3);
    expect(blocked).toEqual({ ok: false, reason: "limit_reached" });
    expect((await send(b.id, 1)).ok).toBe(true);
    expect(llm.complete).toHaveBeenCalledTimes(3); // the blocked message never reached the model
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionTestHarness } from "../../../../test-support/action-test-harness";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

const harness = new ActionTestHarness();
const KEY = "wego_live_" + "a1b2" + "3".repeat(40) + "c4d5";

let businessId: string;
let GET: (request: Request) => Promise<Response>;
let POST: (request: Request) => Promise<Response>;
let repo: import("../../../auth/repository/database-business-repository").DatabaseBusinessRepository;

function call(handler: (r: Request) => Promise<Response>, url: string, init: { key?: string | null; origin?: string; ip?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": init.ip ?? "9.9.9.9", "content-type": "application/json" };
  if (init.key !== null) headers.authorization = `Bearer ${init.key ?? KEY}`;
  if (init.origin) headers.origin = init.origin;
  return handler(new Request(url, { method: init.body ? "POST" : "GET", headers, body: init.body ? JSON.stringify(init.body) : undefined }));
}
const get = (init = {}) => call(GET, "http://atlas.test/api/public/v1/inventory", init);
const post = (init = {}) => call(POST, "http://atlas.test/api/public/v1/leads", { body: { name: "Wanjiku", phone: "0712345678", message: "Interested" }, ...init });

beforeAll(async () => {
  await harness.setup();
  GET = (await import("@/app/api/public/v1/inventory/route")).GET;
  POST = (await import("@/app/api/public/v1/leads/route")).POST;
  const { DatabaseBusinessRepository } = await import("../../../auth/repository/database-business-repository");
  repo = new DatabaseBusinessRepository();
});
afterAll(() => harness.teardown());
beforeEach(async () => {
  harness.reset();
  resetRateLimitsForTests();
  const business = harness.seedBusiness("API Shop", "pro");
  businessId = business.id;
  await repo.updateSettings(businessId, { websiteMode: "own_website" });
  await repo.setPublicApiKey(businessId, KEY);
});

describe("public API authentication", () => {
  it("rejects a missing or wrong key with 401 and no business detail", async () => {
    expect((await get({ key: null })).status).toBe(401);
    const bad = await get({ key: "wego_live_nope" });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: "Invalid API key." });
  });

  it("accepts a valid key", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(Array.isArray((await response.json()).items)).toBe(true);
  });

  it("rotated and revoked keys stop working immediately", async () => {
    await repo.setPublicApiKey(businessId, "wego_live_rotated");
    expect((await get()).status).toBe(401);
    expect((await get({ key: "wego_live_rotated" })).status).toBe(200);
    await repo.clearPublicApiKey(businessId);
    expect((await get({ key: "wego_live_rotated" })).status).toBe(401);
  });

  it("a legacy plaintext key keeps working (and is upgraded)", async () => {
    harness.run("UPDATE businesses SET public_api_key = ?, public_api_key_hash = NULL, public_api_key_hint = NULL WHERE id = ?", "wego_live_legacy", businessId);
    expect((await get({ key: "wego_live_legacy" })).status).toBe(200);
    expect(harness.row<{ public_api_key: string | null }>("SELECT public_api_key FROM businesses WHERE id = ?", businessId)?.public_api_key).toBeNull();
  });
});

describe("browser-origin allowlist", () => {
  it("with no allowlist, any origin works and CORS stays open", async () => {
    const response = await get({ origin: "https://anything.example" });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("with an allowlist: allowed origin is reflected, others get 403, server-to-server (no Origin) still works", async () => {
    await repo.updateSettings(businessId, { publicApiAllowedOrigins: ["https://shop.co.ke"] });
    const ok = await get({ origin: "https://shop.co.ke" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://shop.co.ke");
    expect(ok.headers.get("vary")).toBe("Origin");

    const denied = await get({ origin: "https://evil.example" });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");

    expect((await get({})).status).toBe(200);
  });

  it("a disallowed origin cannot create a lead (rejected before any write)", async () => {
    await repo.updateSettings(businessId, { publicApiAllowedOrigins: ["https://shop.co.ke"] });
    const before = harness.row<{ n: number }>("SELECT COUNT(*) AS n FROM leads")!.n;
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect(harness.row<{ n: number }>("SELECT COUNT(*) AS n FROM leads")!.n).toBe(before);
    expect((await post({ origin: "https://shop.co.ke" })).status).toBe(201);
    expect(harness.row<{ n: number }>("SELECT COUNT(*) AS n FROM leads")!.n).toBe(before + 1);
  });
});

describe("public API rate limiting", () => {
  it("inventory: the 61st request in a minute for one key is 429 with Retry-After", async () => {
    // spread across IPs so the per-key limit (60) is what trips, not the per-IP one (120)
    for (let i = 0; i < 60; i++) expect((await get({ ip: `10.0.0.${i}` })).status).toBe(200);
    const limited = await get({ ip: "10.0.1.1" });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("per-IP limit applies even to invalid keys (key-guessing flood)", async () => {
    for (let i = 0; i < 120; i++) await get({ key: `wego_live_guess${i}`, ip: "6.6.6.6" });
    expect((await get({ key: "wego_live_guessX", ip: "6.6.6.6" })).status).toBe(429);
    expect((await get({ ip: "7.7.7.7" })).status).toBe(200); // other IPs unaffected
  });

  it("leads: tighter limit (20/min per IP) so a form can't be spammed into the CRM", async () => {
    for (let i = 0; i < 20; i++) expect((await post({ ip: "5.5.5.5" })).status).toBe(201);
    expect((await post({ ip: "5.5.5.5" })).status).toBe(429);
  });
});

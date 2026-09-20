import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { EntitlementService as EntitlementServiceClass } from "../entitlement-service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-entitlement-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let EntitlementService: typeof EntitlementServiceClass;
let DatabaseSubscriptionRepository: typeof import("../../repository/database-subscription-repository").DatabaseSubscriptionRepository;
let rawDb: Database.Database;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  setupDb.close();

  EntitlementService = (await import("../entitlement-service")).EntitlementService;
  DatabaseSubscriptionRepository = (await import("../../repository/database-subscription-repository"))
    .DatabaseSubscriptionRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

let counter = 0;
function nextId(prefix: string) {
  counter += 1;
  return `${prefix}_${counter}`;
}

function seedBusinessWithSubscription(plan: string, status = "active"): string {
  const id = nextId("biz");
  const now = new Date().toISOString();
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(id, `Business ${id}`, now, now);
  rawDb
    .prepare(
      "INSERT INTO subscriptions (id, business_id, plan, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(`sub_${id}`, id, plan, status, now, now);
  return id;
}

beforeEach(() => {
  rawDb.exec("DELETE FROM subscriptions; DELETE FROM businesses;");
});

function getService(): EntitlementServiceClass {
  return new EntitlementService(new DatabaseSubscriptionRepository());
}

describe("EntitlementService.canAccess", () => {
  it("returns NO_SUBSCRIPTION for a business with no subscription row", async () => {
    const businessId = nextId("biz-no-sub");
    const now = new Date().toISOString();
    rawDb
      .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(businessId, "No Subscription Biz", now, now);

    const decision = await getService().canAccess(businessId, "storefront");
    expect(decision).toEqual({ allowed: false, reason: "NO_SUBSCRIPTION" });
  });

  it("returns CAPABILITY_GRANTED for an entitled, active business", async () => {
    const businessId = seedBusinessWithSubscription("growth", "active");
    const decision = await getService().canAccess(businessId, "storefront");
    expect(decision.allowed).toBe(true);
  });

  it("returns PLAN_DOES_NOT_INCLUDE_CAPABILITY for a starter business", async () => {
    const businessId = seedBusinessWithSubscription("starter", "active");
    const decision = await getService().canAccess(businessId, "storefront");
    expect(decision).toEqual({ allowed: false, reason: "PLAN_DOES_NOT_INCLUDE_CAPABILITY" });
  });

  it("returns SUBSCRIPTION_INACTIVE for an otherwise-entitled but cancelled business", async () => {
    const businessId = seedBusinessWithSubscription("pro", "cancelled");
    const decision = await getService().canAccess(businessId, "external_integration");
    expect(decision).toEqual({ allowed: false, reason: "SUBSCRIPTION_INACTIVE" });
  });
});

describe("EntitlementService.checkLimit", () => {
  it("allows usage within the plan's limit", async () => {
    const businessId = seedBusinessWithSubscription("starter", "active");
    const decision = await getService().checkLimit(businessId, "vehicles", 49);
    expect(decision.allowed).toBe(true);
  });

  it("rejects usage at the plan's limit", async () => {
    const businessId = seedBusinessWithSubscription("starter", "active");
    const decision = await getService().checkLimit(businessId, "vehicles", 50);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("LIMIT_EXCEEDED");
  });

  it("is unlimited on pro even at very high usage", async () => {
    const businessId = seedBusinessWithSubscription("pro", "active");
    const decision = await getService().checkLimit(businessId, "vehicles", 5_000);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("UNLIMITED");
  });

  it("feature-enabled-but-limit-exceeded still rejects (Mission 028, Section 22 #13): growth has storefront but a real vehicle limit", async () => {
    const businessId = seedBusinessWithSubscription("growth", "active");
    const capabilityDecision = await getService().canAccess(businessId, "storefront");
    const limitDecision = await getService().checkLimit(businessId, "vehicles", 250);
    expect(capabilityDecision.allowed).toBe(true);
    expect(limitDecision.allowed).toBe(false);
  });
});

/** Mission 029, Section 11 — effective status is evaluated from an explicit `now`, without persisting anything, so a trial that has already elapsed correctly denies access before reconcileElapsed ever runs. */
describe("EntitlementService — effective status via explicit now (Mission 029, Section 11)", () => {
  it("denies a capability once a trial's stored trialEndsAt has passed, using the supplied now", async () => {
    const businessId = seedBusinessWithSubscription("growth", "trialing");
    rawDb
      .prepare("UPDATE subscriptions SET trial_ends_at = ? WHERE business_id = ?")
      .run("2026-01-01T00:00:00.000Z", businessId);

    const decision = await getService().canAccess(businessId, "storefront", new Date("2026-02-01T00:00:00.000Z"));
    expect(decision).toEqual({ allowed: false, reason: "SUBSCRIPTION_INACTIVE" });
  });

  it("still grants the capability for a `now` before trialEndsAt", async () => {
    const businessId = seedBusinessWithSubscription("growth", "trialing");
    rawDb
      .prepare("UPDATE subscriptions SET trial_ends_at = ? WHERE business_id = ?")
      .run("2026-06-01T00:00:00.000Z", businessId);

    const decision = await getService().canAccess(businessId, "storefront", new Date("2026-01-01T00:00:00.000Z"));
    expect(decision.allowed).toBe(true);
  });

  it("does not mutate the stored row — evaluation is read-only", async () => {
    const businessId = seedBusinessWithSubscription("growth", "trialing");
    rawDb
      .prepare("UPDATE subscriptions SET trial_ends_at = ? WHERE business_id = ?")
      .run("2026-01-01T00:00:00.000Z", businessId);

    await getService().canAccess(businessId, "storefront", new Date("2026-02-01T00:00:00.000Z"));

    const row = rawDb.prepare("SELECT status FROM subscriptions WHERE business_id = ?").get(businessId) as {
      status: string;
    };
    expect(row.status).toBe("trialing"); // unchanged in the database
  });
});

describe("resolveLimitGate (Mission 029, Section 14)", () => {
  it("returns the plan's numeric limit for an active subscription", async () => {
    const businessId = seedBusinessWithSubscription("starter", "active");
    const gate = await getService().resolveLimitGate(businessId, "vehicles");
    expect(gate).toEqual({ ok: true, limit: 50 });
  });

  it("returns null (unlimited) for pro", async () => {
    const businessId = seedBusinessWithSubscription("pro", "active");
    const gate = await getService().resolveLimitGate(businessId, "vehicles");
    expect(gate).toEqual({ ok: true, limit: null });
  });

  it("rejects with SUBSCRIPTION_INACTIVE for a cancelled subscription", async () => {
    const businessId = seedBusinessWithSubscription("growth", "cancelled");
    const gate = await getService().resolveLimitGate(businessId, "vehicles");
    expect(gate).toEqual({ ok: false, reason: "SUBSCRIPTION_INACTIVE" });
  });

  it("still allows the gate during a past_due grace period", async () => {
    const businessId = seedBusinessWithSubscription("starter", "past_due");
    const gate = await getService().resolveLimitGate(businessId, "vehicles");
    expect(gate.ok).toBe(true);
  });

  it("rejects with NO_SUBSCRIPTION when no subscription row exists", async () => {
    const businessId = nextId("biz-no-sub-gate");
    const now = new Date().toISOString();
    rawDb.prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      businessId,
      "No Sub",
      now,
      now
    );
    const gate = await getService().resolveLimitGate(businessId, "vehicles");
    expect(gate).toEqual({ ok: false, reason: "NO_SUBSCRIPTION" });
  });
});

describe("getAccessLevel (Mission 029, Section 13)", () => {
  it("is 'full' for active", async () => {
    const businessId = seedBusinessWithSubscription("starter", "active");
    expect(await getService().getAccessLevel(businessId)).toBe("full");
  });

  it("is 'grace' for past_due", async () => {
    const businessId = seedBusinessWithSubscription("starter", "past_due");
    expect(await getService().getAccessLevel(businessId)).toBe("grace");
  });

  it("is 'locked' for cancelled", async () => {
    const businessId = seedBusinessWithSubscription("starter", "cancelled");
    expect(await getService().getAccessLevel(businessId)).toBe("locked");
  });
});

describe("Multi-tenancy (Mission 028, Section 18/22 #14-16)", () => {
  it("Organization A cannot access Organization B's plan capabilities", async () => {
    const orgA = seedBusinessWithSubscription("starter", "active");
    const orgB = seedBusinessWithSubscription("pro", "active");

    const decisionA = await getService().canAccess(orgA, "external_integration");
    const decisionB = await getService().canAccess(orgB, "external_integration");

    expect(decisionA.allowed).toBe(false);
    expect(decisionB.allowed).toBe(true);
  });

  it("Organization A cannot inherit Organization B's entitlement even when queried back-to-back", async () => {
    const orgA = seedBusinessWithSubscription("starter", "active");
    const orgB = seedBusinessWithSubscription("pro", "active");
    const service = getService();

    // Interleave the calls — a shared-state bug would show up here.
    const [aFirst, bFirst, aSecond, bSecond] = await Promise.all([
      service.canAccess(orgA, "storefront"),
      service.canAccess(orgB, "storefront"),
      service.canAccess(orgA, "external_integration"),
      service.canAccess(orgB, "external_integration"),
    ]);

    expect(aFirst.allowed).toBe(false);
    expect(bFirst.allowed).toBe(true);
    expect(aSecond.allowed).toBe(false);
    expect(bSecond.allowed).toBe(true);
  });

  it("a cross-tenant subscription lookup for a nonexistent business fails safely (NO_SUBSCRIPTION, not a crash or another tenant's data)", async () => {
    const decision = await getService().canAccess("does-not-exist", "storefront");
    expect(decision).toEqual({ allowed: false, reason: "NO_SUBSCRIPTION" });
  });

  it("Organization A's usage limit is evaluated independently of Organization B's usage", async () => {
    const orgA = seedBusinessWithSubscription("starter", "active");
    const orgB = seedBusinessWithSubscription("starter", "active");
    const service = getService();

    // Org B is "at" its limit; Org A is nowhere near it — A must not
    // be affected by B's usage number since each call is scoped by
    // businessId end-to-end (repository WHERE business_id = ?).
    const decisionA = await service.checkLimit(orgA, "vehicles", 2);
    const decisionB = await service.checkLimit(orgB, "vehicles", 50);

    expect(decisionA.allowed).toBe(true);
    expect(decisionB.allowed).toBe(false);
  });
});

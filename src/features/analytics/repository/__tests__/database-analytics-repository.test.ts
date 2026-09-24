import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseAnalyticsRepository as AnalyticsRepoClass } from "../database-analytics-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { ResolvedDateRange } from "../../domain/date-range";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-analytics-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseAnalyticsRepository: typeof AnalyticsRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let rawDb: Database.Database;

const ALL_TIME: ResolvedDateRange = { preset: "allTime", from: null, to: null };

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  setupDb.close();

  DatabaseAnalyticsRepository = (await import("../database-analytics-repository")).DatabaseAnalyticsRepository;
  DatabaseCustomerRepository = (await import("../../../customers/repository/database-customer-repository"))
    .DatabaseCustomerRepository;

  rawDb = new Database(testDbPath);
  const now = new Date().toISOString();
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("biz_test", "Test Business", now, now);
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("biz_other", "Other Business", now, now);
  rawDb.pragma("foreign_keys = ON");
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

async function makeCustomer(businessId: string) {
  return new DatabaseCustomerRepository(businessId).createCustomer({ name: "Test Customer", phone: "0700000000" });
}

/** Raw insert so createdAt can be backdated for date-range tests — no repository method exposes a custom createdAt (Section 6 timestamps are always server-set at creation, mirroring every other Atlas domain). */
function seedLead(
  businessId: string,
  customerId: string,
  options: { status?: string; createdAt?: string; nextFollowUpAt?: string | null; vehicleId?: string | null } = {}
) {
  const id = nextId("lead");
  const createdAt = options.createdAt ?? new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO leads (id, business_id, customer_id, vehicle_id, vehicle_label, status, next_follow_up_at, last_contacted_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, '', ?, ?)`
    )
    .run(
      id,
      businessId,
      customerId,
      options.vehicleId ?? null,
      options.status ?? "new",
      options.nextFollowUpAt ?? null,
      createdAt,
      createdAt
    );
  return { id };
}

function seedDeal(
  businessId: string,
  customerId: string,
  leadId: string,
  options: { status?: string; agreedPrice?: number; createdAt?: string; vehicleId?: string | null } = {}
) {
  const id = nextId("deal");
  const createdAt = options.createdAt ?? new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO deals (id, business_id, customer_id, lead_id, vehicle_id, vehicle_label, status, agreed_price, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, '', ?, ?)`
    )
    .run(
      id,
      businessId,
      customerId,
      leadId,
      options.vehicleId ?? null,
      options.status ?? "draft",
      options.agreedPrice ?? 900_000,
      createdAt,
      createdAt
    );
  return { id };
}

function seedSale(
  businessId: string,
  dealId: string,
  customerId: string,
  options: { saleAmount?: number; soldAt?: string; vehicleId?: string | null } = {}
) {
  const id = nextId("sale");
  const soldAt = options.soldAt ?? new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO sales (id, business_id, deal_id, customer_id, vehicle_id, vehicle_label, sale_amount, sold_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, '', ?, ?)`
    )
    .run(
      id,
      businessId,
      dealId,
      customerId,
      options.vehicleId ?? null,
      options.saleAmount ?? 900_000,
      soldAt,
      soldAt,
      soldAt
    );
  return { id };
}

describe("DatabaseAnalyticsRepository", () => {
  let repo: InstanceType<typeof AnalyticsRepoClass>;
  let otherRepo: InstanceType<typeof AnalyticsRepoClass>;

  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
    repo = new DatabaseAnalyticsRepository("biz_test");
    otherRepo = new DatabaseAnalyticsRepository("biz_other");
  });

  describe("getLeadStatusCounts", () => {
    it("returns zero for every status when there are no leads (zero records)", async () => {
      const counts = await repo.getLeadStatusCounts(ALL_TIME);
      expect(counts).toEqual({ new: 0, contacted: 0, qualified: 0, negotiating: 0, won: 0, lost: 0 });
    });

    it("counts leads correctly by status", async () => {
      const customer = await makeCustomer("biz_test");
      seedLead("biz_test", customer.id, { status: "new" });
      seedLead("biz_test", customer.id, { status: "new" });
      seedLead("biz_test", customer.id, { status: "won" });
      seedLead("biz_test", customer.id, { status: "lost" });

      const counts = await repo.getLeadStatusCounts(ALL_TIME);
      expect(counts.new).toBe(2);
      expect(counts.won).toBe(1);
      expect(counts.lost).toBe(1);
      expect(counts.contacted).toBe(0);
    });

    it("applies inclusive-from / exclusive-to date filtering on createdAt", async () => {
      const customer = await makeCustomer("biz_test");
      seedLead("biz_test", customer.id, { createdAt: "2026-01-10T00:00:00.000Z" }); // before range
      seedLead("biz_test", customer.id, { createdAt: "2026-01-15T00:00:00.000Z" }); // exactly at `from` — included
      seedLead("biz_test", customer.id, { createdAt: "2026-01-19T23:59:59.999Z" }); // just under `to` — included
      seedLead("biz_test", customer.id, { createdAt: "2026-01-20T00:00:00.000Z" }); // exactly at `to` — excluded

      const range: ResolvedDateRange = {
        preset: "custom",
        from: "2026-01-15T00:00:00.000Z",
        to: "2026-01-20T00:00:00.000Z",
      };
      const counts = await repo.getLeadStatusCounts(range);
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      expect(total).toBe(2);
    });

    it("returns zero for an empty period inside otherwise-populated data", async () => {
      const customer = await makeCustomer("biz_test");
      seedLead("biz_test", customer.id, { createdAt: "2026-01-01T00:00:00.000Z" });

      const range: ResolvedDateRange = {
        preset: "custom",
        from: "2027-01-01T00:00:00.000Z",
        to: "2027-02-01T00:00:00.000Z",
      };
      const counts = await repo.getLeadStatusCounts(range);
      expect(Object.values(counts).every((n) => n === 0)).toBe(true);
    });

    it("scopes to the constructed business only (isolation)", async () => {
      const customer = await makeCustomer("biz_test");
      const otherCustomer = await makeCustomer("biz_other");
      seedLead("biz_test", customer.id);
      seedLead("biz_other", otherCustomer.id);
      seedLead("biz_other", otherCustomer.id);

      const counts = await repo.getLeadStatusCounts(ALL_TIME);
      const otherCounts = await otherRepo.getLeadStatusCounts(ALL_TIME);
      expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(1);
      expect(Object.values(otherCounts).reduce((s, n) => s + n, 0)).toBe(2);
    });
  });

  describe("getDealStatusCounts / getActiveDealPipelineStats", () => {
    it("sums agreedPrice only across active (non-terminal) deals", async () => {
      const customer = await makeCustomer("biz_test");
      // Each deal gets its own lead — deals_lead_id_active_uidx allows
      // at most one non-terminal deal per lead, and this test needs
      // three simultaneously-active deals.
      seedDeal("biz_test", customer.id, seedLead("biz_test", customer.id).id, { status: "draft", agreedPrice: 500_000 });
      seedDeal("biz_test", customer.id, seedLead("biz_test", customer.id).id, {
        status: "negotiating",
        agreedPrice: 700_000,
      });
      seedDeal("biz_test", customer.id, seedLead("biz_test", customer.id).id, {
        status: "reserved",
        agreedPrice: 300_000,
      });
      seedDeal("biz_test", customer.id, seedLead("biz_test", customer.id).id, {
        status: "completed",
        agreedPrice: 1_000_000,
      });
      seedDeal("biz_test", customer.id, seedLead("biz_test", customer.id).id, {
        status: "cancelled",
        agreedPrice: 200_000,
      });

      const stats = await repo.getActiveDealPipelineStats(ALL_TIME);
      expect(stats.activeCount).toBe(3);
      expect(stats.pipelineValue).toBe(1_500_000);

      const counts = await repo.getDealStatusCounts(ALL_TIME);
      expect(counts.completed).toBe(1);
      expect(counts.cancelled).toBe(1);
    });

    it("returns zero pipeline value with zero active deals (zero denominator upstream)", async () => {
      const stats = await repo.getActiveDealPipelineStats(ALL_TIME);
      expect(stats).toEqual({ activeCount: 0, pipelineValue: 0 });
    });
  });

  describe("getSalesStats / getHighestValueSale", () => {
    it("sums and counts sales, ranged by soldAt", async () => {
      const customer = await makeCustomer("biz_test");
      const leadA = seedLead("biz_test", customer.id);
      const dealA = seedDeal("biz_test", customer.id, leadA.id, { status: "completed" });
      seedSale("biz_test", dealA.id, customer.id, { saleAmount: 500_000, soldAt: "2026-02-01T00:00:00.000Z" });

      const leadB = seedLead("biz_test", customer.id);
      const dealB = seedDeal("biz_test", customer.id, leadB.id, { status: "completed" });
      seedSale("biz_test", dealB.id, customer.id, { saleAmount: 1_500_000, soldAt: "2026-02-10T00:00:00.000Z" });

      const stats = await repo.getSalesStats(ALL_TIME);
      expect(stats.totalSales).toBe(2);
      expect(stats.grossSalesValue).toBe(2_000_000);

      const highest = await repo.getHighestValueSale(ALL_TIME);
      expect(highest?.saleAmount).toBe(1_500_000);
    });

    it("tolerates a zero-amount sale (valid per Sale validation) without breaking sums", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = seedLead("biz_test", customer.id);
      const deal = seedDeal("biz_test", customer.id, lead.id, { status: "completed" });
      seedSale("biz_test", deal.id, customer.id, { saleAmount: 0 });

      const stats = await repo.getSalesStats(ALL_TIME);
      expect(stats.totalSales).toBe(1);
      expect(stats.grossSalesValue).toBe(0);
    });

    it("handles large values without precision loss", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = seedLead("biz_test", customer.id);
      const deal = seedDeal("biz_test", customer.id, lead.id, { status: "completed" });
      seedSale("biz_test", deal.id, customer.id, { saleAmount: 999_999_999 });

      const stats = await repo.getSalesStats(ALL_TIME);
      expect(stats.grossSalesValue).toBe(999_999_999);
    });

    it("returns null highest-value sale when there are no sales", async () => {
      expect(await repo.getHighestValueSale(ALL_TIME)).toBeNull();
    });

    it("tolerates a missing/nulled vehicle relationship on a sale", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = seedLead("biz_test", customer.id);
      const deal = seedDeal("biz_test", customer.id, lead.id, { status: "completed" });
      seedSale("biz_test", deal.id, customer.id, { vehicleId: null });

      const stats = await repo.getSalesStats(ALL_TIME);
      expect(stats.totalSales).toBe(1);
    });
  });

  describe("getSalesTrend", () => {
    it("groups sales into day buckets and sums correctly per bucket", async () => {
      const customer = await makeCustomer("biz_test");
      const leadA = seedLead("biz_test", customer.id);
      const dealA = seedDeal("biz_test", customer.id, leadA.id, { status: "completed" });
      seedSale("biz_test", dealA.id, customer.id, { saleAmount: 100_000, soldAt: "2026-02-01T08:00:00.000Z" });
      const leadB = seedLead("biz_test", customer.id);
      const dealB = seedDeal("biz_test", customer.id, leadB.id, { status: "completed" });
      seedSale("biz_test", dealB.id, customer.id, { saleAmount: 200_000, soldAt: "2026-02-01T20:00:00.000Z" });
      const leadC = seedLead("biz_test", customer.id);
      const dealC = seedDeal("biz_test", customer.id, leadC.id, { status: "completed" });
      seedSale("biz_test", dealC.id, customer.id, { saleAmount: 50_000, soldAt: "2026-02-02T09:00:00.000Z" });

      const trend = await repo.getSalesTrend(ALL_TIME, "day");
      expect(trend).toHaveLength(2);
      expect(trend[0].salesCount).toBe(2);
      expect(trend[0].grossValue).toBe(300_000);
      expect(trend[1].salesCount).toBe(1);
      expect(trend[1].grossValue).toBe(50_000);
    });

    it("returns an empty array for a period with no sales", async () => {
      const trend = await repo.getSalesTrend(ALL_TIME, "month");
      expect(trend).toEqual([]);
    });
  });

  describe("getFollowUpMetrics", () => {
    const now = "2026-03-15T12:00:00.000Z";

    it("partitions active leads into overdue / due / upcoming / without a follow-up", async () => {
      const customer = await makeCustomer("biz_test");
      seedLead("biz_test", customer.id, { status: "new", nextFollowUpAt: "2026-03-10T00:00:00.000Z" }); // overdue
      seedLead("biz_test", customer.id, { status: "contacted", nextFollowUpAt: "2026-03-15T08:00:00.000Z" }); // due today
      seedLead("biz_test", customer.id, { status: "qualified", nextFollowUpAt: "2026-03-20T00:00:00.000Z" }); // upcoming
      seedLead("biz_test", customer.id, { status: "negotiating", nextFollowUpAt: null }); // without
      seedLead("biz_test", customer.id, { status: "won", nextFollowUpAt: null }); // terminal — excluded entirely

      const metrics = await repo.getFollowUpMetrics(now);
      expect(metrics.overdueFollowUps).toBe(1);
      expect(metrics.dueFollowUps).toBe(1);
      expect(metrics.upcomingFollowUps).toBe(1);
      expect(metrics.activeLeadsWithoutFollowUp).toBe(1);
    });

    it("returns all zeros when there are no active leads", async () => {
      const metrics = await repo.getFollowUpMetrics(now);
      expect(metrics).toEqual({
        overdueFollowUps: 0,
        dueFollowUps: 0,
        upcomingFollowUps: 0,
        activeLeadsWithoutFollowUp: 0,
      });
    });
  });

  describe("getFunnelMetrics", () => {
    it("counts each stage using distinct lead identity, not row count off the join", async () => {
      const customer = await makeCustomer("biz_test");

      seedLead("biz_test", customer.id); // lead with no deal at all

      const leadWithDeal = seedLead("biz_test", customer.id);
      seedDeal("biz_test", customer.id, leadWithDeal.id, { status: "negotiating" });

      // A lead with THREE historical deals (e.g. reopened/renegotiated) —
      // must still count as exactly one lead in "leadsWithDeals".
      const leadMultiDeal = seedLead("biz_test", customer.id);
      seedDeal("biz_test", customer.id, leadMultiDeal.id, { status: "cancelled" });
      seedDeal("biz_test", customer.id, leadMultiDeal.id, { status: "cancelled" });
      const leadMultiDealFinalDeal = seedDeal("biz_test", customer.id, leadMultiDeal.id, { status: "completed" });
      seedSale("biz_test", leadMultiDealFinalDeal.id, customer.id, {});

      const funnel = await repo.getFunnelMetrics(ALL_TIME);
      expect(funnel.totalLeads).toBe(3);
      expect(funnel.leadsWithDeals).toBe(2);
      expect(funnel.leadsWithCompletedDeals).toBe(1);
      expect(funnel.leadsWithSales).toBe(1);
      expect(funnel.leadToDealRate).toBeCloseTo(2 / 3);
      expect(funnel.leadToSaleRate).toBeCloseTo(1 / 3);
    });

    it("computes deal->sale conversion from Deal identity, not lead identity", async () => {
      const customer = await makeCustomer("biz_test");
      const leadA = seedLead("biz_test", customer.id);
      const dealA = seedDeal("biz_test", customer.id, leadA.id, { status: "completed" });
      seedSale("biz_test", dealA.id, customer.id, {});

      const leadB = seedLead("biz_test", customer.id);
      seedDeal("biz_test", customer.id, leadB.id, { status: "completed" }); // no sale yet

      const funnel = await repo.getFunnelMetrics(ALL_TIME);
      expect(funnel.completedDealsInRange).toBe(2);
      expect(funnel.completedDealsWithSaleInRange).toBe(1);
      expect(funnel.dealToSaleRate).toBeCloseTo(0.5);
    });

    it("returns null rates (not NaN/Infinity) when there are zero leads", async () => {
      const funnel = await repo.getFunnelMetrics(ALL_TIME);
      expect(funnel.totalLeads).toBe(0);
      expect(funnel.leadToDealRate).toBeNull();
      expect(funnel.leadToCompletedDealRate).toBeNull();
      expect(funnel.leadToSaleRate).toBeNull();
      expect(funnel.dealToSaleRate).toBeNull();
    });

    it("scopes the funnel to the constructed business only", async () => {
      const customer = await makeCustomer("biz_test");
      seedLead("biz_test", customer.id);

      const otherCustomer = await makeCustomer("biz_other");
      seedLead("biz_other", otherCustomer.id);
      seedLead("biz_other", otherCustomer.id);

      expect((await repo.getFunnelMetrics(ALL_TIME)).totalLeads).toBe(1);
      expect((await otherRepo.getFunnelMetrics(ALL_TIME)).totalLeads).toBe(2);
    });
  });

  describe("getIntegrityMetrics", () => {
    it("counts completed deals without a sale, and excludes those with one", async () => {
      const customer = await makeCustomer("biz_test");

      const leadA = seedLead("biz_test", customer.id);
      const dealA = seedDeal("biz_test", customer.id, leadA.id, { status: "completed" });
      seedSale("biz_test", dealA.id, customer.id, {}); // has a sale — not awaiting

      const leadB = seedLead("biz_test", customer.id);
      seedDeal("biz_test", customer.id, leadB.id, { status: "completed" }); // awaiting

      const leadC = seedLead("biz_test", customer.id);
      seedDeal("biz_test", customer.id, leadC.id, { status: "negotiating" }); // not completed — irrelevant

      const integrity = await repo.getIntegrityMetrics();
      expect(integrity.completedDealsAwaitingSale).toBe(1);
    });

    it("is not date-ranged — an old completed deal without a sale still counts today", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = seedLead("biz_test", customer.id, { createdAt: "2020-01-01T00:00:00.000Z" });
      seedDeal("biz_test", customer.id, lead.id, { status: "completed", createdAt: "2020-01-01T00:00:00.000Z" });

      const integrity = await repo.getIntegrityMetrics();
      expect(integrity.completedDealsAwaitingSale).toBe(1);
    });

    it("returns zero when every completed deal has a sale", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = seedLead("biz_test", customer.id);
      const deal = seedDeal("biz_test", customer.id, lead.id, { status: "completed" });
      seedSale("biz_test", deal.id, customer.id, {});

      expect((await repo.getIntegrityMetrics()).completedDealsAwaitingSale).toBe(0);
    });

    it("scopes to the constructed business only (cross-business IDOR check)", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = seedLead("biz_test", customer.id);
      seedDeal("biz_test", customer.id, lead.id, { status: "completed" });

      expect((await otherRepo.getIntegrityMetrics()).completedDealsAwaitingSale).toBe(0);
    });
  });
});

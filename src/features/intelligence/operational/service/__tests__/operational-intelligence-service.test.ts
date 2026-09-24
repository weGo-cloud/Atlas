import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { getOperationalIntelligenceService as GetOperationalIntelligenceServiceType } from "../index";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../../customers/repository/database-customer-repository";
import { ALL_TIME_RANGE } from "../../../domain/__tests__/fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-operational-intelligence-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let getOperationalIntelligenceService: typeof GetOperationalIntelligenceServiceType;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
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

  getOperationalIntelligenceService = (await import("../index")).getOperationalIntelligenceService;
  DatabaseCustomerRepository = (await import("../../../../customers/repository/database-customer-repository"))
    .DatabaseCustomerRepository;

  rawDb = new Database(testDbPath);
  const now = new Date().toISOString();
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("biz_test", "Test Business", now, now);
  rawDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("biz_other", "Other Business", now, now);
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

function seedLead(
  businessId: string,
  customerId: string,
  status = "new",
  nextFollowUpAt: string | null = null,
  vehicleLabel: string | null = null,
  vehicleId: string | null = null
) {
  const id = nextId("lead");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO leads (id, business_id, customer_id, vehicle_id, vehicle_label, status, next_follow_up_at, last_contacted_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '', ?, ?)`
    )
    .run(id, businessId, customerId, vehicleId, vehicleLabel, status, nextFollowUpAt, now, now);
  return { id };
}

function seedDeal(
  businessId: string,
  customerId: string,
  leadId: string,
  status: string,
  agreedPrice: number,
  vehicleLabel: string | null = null
) {
  const id = nextId("deal");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO deals (id, business_id, customer_id, lead_id, vehicle_id, vehicle_label, status, agreed_price, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, '', ?, ?)`
    )
    .run(id, businessId, customerId, leadId, vehicleLabel, status, agreedPrice, now, now);
  return { id };
}

function seedVehicle(businessId: string, status: string, addedAt: string) {
  const id = nextId("vehicle");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO vehicles (id, business_id, stock_id, make, model, year, mileage, price, status, description, added_at, updated_at)
       VALUES (?, ?, ?, 'Toyota', 'Fielder', 2020, 50000, 1500000, ?, '', ?, ?)`
    )
    .run(id, businessId, `STK-${id}`, status, addedAt, now);
  return { id };
}

describe("OperationalIntelligenceService", () => {
  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
  });

  it("produces no recommendations against a quiet business", async () => {
    const service = getOperationalIntelligenceService("biz_test");
    const result = await service.getOperationalIntelligence(ALL_TIME_RANGE);

    expect(result.recommendations).toEqual([]);
    expect(result.summary.totalRecommendations).toBe(0);
    expect(result.summary.highestPriority).toBeNull();
  });

  it("surfaces complete_deal_sale_records with the affected deal resolved", async () => {
    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const customer = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    const lead = seedLead("biz_test", customer.id);
    const deal = seedDeal("biz_test", customer.id, lead.id, "completed", 1_000_000, "2020 Toyota Fielder");

    const service = getOperationalIntelligenceService("biz_test");
    const result = await service.getOperationalIntelligence(ALL_TIME_RANGE);

    const rec = result.recommendations.find((r) => r.type === "complete_deal_sale_records");
    expect(rec).toBeDefined();
    expect(rec?.priority).toBe("HIGH");
    expect(rec?.affectedEntities).toEqual([
      { type: "deal", id: deal.id, label: "2020 Toyota Fielder", href: `/app/deals/${deal.id}` },
    ]);
  });

  it("surfaces review_overdue_follow_ups with the affected lead resolved", async () => {
    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const customer = await customerRepo.createCustomer({ name: "B", phone: "0700000002" });
    // 10 days ago, well past "overdue" for any `now`.
    const overdueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const lead = seedLead("biz_test", customer.id, "new", overdueDate, "2019 Honda Fit");
    // Push overdue count to the warning threshold (3).
    seedLead("biz_test", customer.id, "new", overdueDate);
    seedLead("biz_test", customer.id, "new", overdueDate);

    const service = getOperationalIntelligenceService("biz_test");
    const result = await service.getOperationalIntelligence(ALL_TIME_RANGE);

    const rec = result.recommendations.find((r) => r.type === "review_overdue_follow_ups");
    expect(rec).toBeDefined();
    expect(rec?.affectedEntities.some((e) => e.id === lead.id && e.label === "2019 Honda Fit")).toBe(true);
  });

  it("never leaks another business's affected entities (cross-business isolation)", async () => {
    const otherCustomerRepo = new DatabaseCustomerRepository("biz_other");
    const otherCustomer = await otherCustomerRepo.createCustomer({ name: "Other", phone: "0711111111" });
    for (let i = 0; i < 5; i++) {
      const lead = seedLead("biz_other", otherCustomer.id);
      seedDeal("biz_other", otherCustomer.id, lead.id, "completed", 500_000);
    }

    const service = getOperationalIntelligenceService("biz_test");
    const result = await service.getOperationalIntelligence(ALL_TIME_RANGE);

    expect(result.recommendations).toEqual([]);
  });

  it("is deterministic — same underlying data, same generatedAt, produces the same result", async () => {
    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const customer = await customerRepo.createCustomer({ name: "C", phone: "0700000003" });
    const lead = seedLead("biz_test", customer.id);
    seedDeal("biz_test", customer.id, lead.id, "completed", 750_000);

    const service = getOperationalIntelligenceService("biz_test");
    const now = "2026-09-02T12:00:00.000Z";
    const a = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);
    const b = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

    expect(a).toEqual(b);
  });

  it("surfaces review_stale_vehicles with the affected vehicle resolved (Mission 026)", async () => {
    const now = "2026-09-02T00:00:00.000Z";
    // 95 days old — clears the 60-day warning threshold.
    seedVehicle("biz_test", "available", "2026-05-30T00:00:00.000Z");

    const service = getOperationalIntelligenceService("biz_test");
    const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

    const rec = result.recommendations.find((r) => r.type === "review_stale_vehicles");
    expect(rec).toBeDefined();
    expect(rec?.affectedEntities[0]?.type).toBe("vehicle");
    expect(rec?.affectedEntities[0]?.href).toMatch(/^\/app\/inventory\//);
  });

  it("does not surface review_stale_vehicles for a fresh or non-available vehicle", async () => {
    const now = "2026-09-02T00:00:00.000Z";
    seedVehicle("biz_test", "available", "2026-08-30T00:00:00.000Z"); // only 3 days old
    seedVehicle("biz_test", "reserved", "2026-01-01T00:00:00.000Z"); // old but not available

    const service = getOperationalIntelligenceService("biz_test");
    const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

    expect(result.recommendations.find((r) => r.type === "review_stale_vehicles")).toBeUndefined();
  });

  it("never leaks another business's stale vehicles into the recommendation", async () => {
    const now = "2026-09-02T00:00:00.000Z";
    seedVehicle("biz_other", "available", "2026-05-30T00:00:00.000Z");

    const service = getOperationalIntelligenceService("biz_test");
    const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

    expect(result.recommendations.find((r) => r.type === "review_stale_vehicles")).toBeUndefined();
  });

  describe("review_stale_vehicles_no_active_lead — Mission 027 (cross-entity)", () => {
    it("surfaces it for a stale available vehicle with zero leads", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const vehicle = seedVehicle("biz_test", "available", "2026-05-30T00:00:00.000Z"); // 95 days old

      const service = getOperationalIntelligenceService("biz_test");
      const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

      const rec = result.recommendations.find((r) => r.type === "review_stale_vehicles_no_active_lead");
      expect(rec).toBeDefined();
      expect(rec?.priority).toBe("URGENT"); // 95 days clears the 90-day critical threshold
      expect(rec?.affectedEntities[0]?.type).toBe("vehicle");
      expect(rec?.affectedEntities[0]?.id).toBe(vehicle.id);
      expect(rec?.affectedEntities[0]?.href).toBe(`/app/inventory/${vehicle.id}`);
    });

    it("does not surface it when the stale vehicle has an active lead", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const vehicle = seedVehicle("biz_test", "available", "2026-05-30T00:00:00.000Z");
      const customerRepo = new DatabaseCustomerRepository("biz_test");
      const customer = await customerRepo.createCustomer({ name: "D", phone: "0700000004" });
      seedLead("biz_test", customer.id, "new", null, null, vehicle.id);

      const service = getOperationalIntelligenceService("biz_test");
      const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

      expect(result.recommendations.find((r) => r.type === "review_stale_vehicles_no_active_lead")).toBeUndefined();
      // The plain stale-vehicle recommendation still fires independently — the lead
      // only suppresses the *compound* condition, not the underlying age signal.
      expect(result.recommendations.find((r) => r.type === "review_stale_vehicles")).toBeDefined();
    });

    it("surfaces it when the stale vehicle's only leads are terminal (won/lost)", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const vehicle = seedVehicle("biz_test", "available", "2026-05-30T00:00:00.000Z");
      const customerRepo = new DatabaseCustomerRepository("biz_test");
      const customer = await customerRepo.createCustomer({ name: "E", phone: "0700000005" });
      seedLead("biz_test", customer.id, "won", null, null, vehicle.id);
      seedLead("biz_test", customer.id, "lost", null, null, vehicle.id);

      const service = getOperationalIntelligenceService("biz_test");
      const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

      expect(result.recommendations.find((r) => r.type === "review_stale_vehicles_no_active_lead")).toBeDefined();
    });

    it("does not surface it for a fresh or non-available vehicle", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      seedVehicle("biz_test", "available", "2026-08-30T00:00:00.000Z"); // 3 days old
      seedVehicle("biz_test", "reserved", "2026-01-01T00:00:00.000Z"); // old but not available

      const service = getOperationalIntelligenceService("biz_test");
      const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

      expect(result.recommendations.find((r) => r.type === "review_stale_vehicles_no_active_lead")).toBeUndefined();
    });

    it("never leaks another business's unengaged stale vehicle into the recommendation", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      seedVehicle("biz_other", "available", "2026-05-30T00:00:00.000Z");

      const service = getOperationalIntelligenceService("biz_test");
      const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

      expect(result.recommendations.find((r) => r.type === "review_stale_vehicles_no_active_lead")).toBeUndefined();
    });

    it("does not let a foreign business's lead (inconsistent cross-business reference) suppress the signal", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const vehicle = seedVehicle("biz_test", "available", "2026-05-30T00:00:00.000Z");
      const otherCustomerRepo = new DatabaseCustomerRepository("biz_other");
      const otherCustomer = await otherCustomerRepo.createCustomer({ name: "Other", phone: "0722222222" });
      // biz_other's lead, inconsistently referencing biz_test's vehicle.
      seedLead("biz_other", otherCustomer.id, "new", null, null, vehicle.id);

      const service = getOperationalIntelligenceService("biz_test");
      const result = await service.getOperationalIntelligence(ALL_TIME_RANGE, now);

      expect(result.recommendations.find((r) => r.type === "review_stale_vehicles_no_active_lead")).toBeDefined();
    });
  });
});

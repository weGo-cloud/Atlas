import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AnalyticsService as AnalyticsServiceClass } from "../analytics-service";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";
import { ALL_TIME_RANGE } from "../../domain/__tests__/test-support";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-analytics-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let getAnalyticsService: (businessId: string) => InstanceType<typeof AnalyticsServiceClass>;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
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

  getAnalyticsService = (await import("../index")).getAnalyticsService;
  DatabaseCustomerRepository = (await import("../../../customers/repository/database-customer-repository"))
    .DatabaseCustomerRepository;
  DatabaseVehicleRepository = (await import("../../../inventory/repository/database-vehicle-repository"))
    .DatabaseVehicleRepository;

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

async function makeVehicle(businessId: string, status: "available" | "reserved" | "sold", price: number) {
  return new DatabaseVehicleRepository(businessId).create({
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId: nextId("STK"),
    mileage: 10_000,
    price,
    status,
    description: "Test vehicle.",
  });
}

function seedLead(businessId: string, customerId: string, status = "new") {
  const id = nextId("lead");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO leads (id, business_id, customer_id, vehicle_id, vehicle_label, status, next_follow_up_at, last_contacted_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, NULL, NULL, '', ?, ?)`
    )
    .run(id, businessId, customerId, status, now, now);
  return { id };
}

function seedDeal(businessId: string, customerId: string, leadId: string, status: string, agreedPrice: number) {
  const id = nextId("deal");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO deals (id, business_id, customer_id, lead_id, vehicle_id, vehicle_label, status, agreed_price, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, '', ?, ?)`
    )
    .run(id, businessId, customerId, leadId, status, agreedPrice, now, now);
  return { id };
}

function seedSale(businessId: string, dealId: string, customerId: string, saleAmount: number) {
  const id = nextId("sale");
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO sales (id, business_id, deal_id, customer_id, vehicle_id, vehicle_label, sale_amount, sold_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, '', ?, ?)`
    )
    .run(id, businessId, dealId, customerId, saleAmount, now, now, now);
  return { id };
}

describe("AnalyticsService", () => {
  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
  });

  it("composes inventory metrics from the existing VehicleRepository (no duplicated aggregation)", async () => {
    await makeVehicle("biz_test", "available", 1_000_000);
    await makeVehicle("biz_test", "available", 2_000_000);
    await makeVehicle("biz_test", "reserved", 1_500_000);
    await makeVehicle("biz_test", "sold", 900_000);

    const service = getAnalyticsService("biz_test");
    const inventory = await service.getInventoryMetrics("2026-09-02T00:00:00.000Z");

    expect(inventory.totalVehicles).toBe(4);
    expect(inventory.availableVehicles).toBe(2);
    expect(inventory.reservedVehicles).toBe(1);
    expect(inventory.soldVehicles).toBe(1);
    // Active inventory value excludes sold vehicles (see VehicleRepository.getActiveInventoryValueStats).
    expect(inventory.currentInventoryValue).toBe(1_000_000 + 2_000_000 + 1_500_000);
    // Mission 026 — one age entry per available vehicle, not per vehicle overall.
    expect(inventory.availableVehicleAgeDays).toHaveLength(2);
  });

  it("composes CRM metrics: totalCustomers is a snapshot, leads are derived from status counts", async () => {
    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const c1 = await customerRepo.createCustomer({ name: "A", phone: "0700000001" });
    await customerRepo.createCustomer({ name: "B", phone: "0700000002" });

    seedLead("biz_test", c1.id, "new");
    seedLead("biz_test", c1.id, "contacted");
    seedLead("biz_test", c1.id, "won");
    seedLead("biz_test", c1.id, "lost");

    const service = getAnalyticsService("biz_test");
    const crm = await service.getCrmMetrics(ALL_TIME_RANGE);

    expect(crm.totalCustomers).toBe(2);
    expect(crm.totalLeads).toBe(4);
    expect(crm.activeLeads).toBe(2); // new + contacted
    expect(crm.wonLeads).toBe(1);
    expect(crm.lostLeads).toBe(1);
  });

  it("computes averageAgreedPrice as null with zero active deals, and correctly otherwise", async () => {
    const service = getAnalyticsService("biz_test");
    const emptyDeals = await service.getDealMetrics(ALL_TIME_RANGE);
    expect(emptyDeals.averageAgreedPrice).toBeNull();
    expect(emptyDeals.pipelineValue).toBe(0);

    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const customer = await customerRepo.createCustomer({ name: "C", phone: "0700000003" });
    seedDeal("biz_test", customer.id, seedLead("biz_test", customer.id).id, "negotiating", 1_000_000);
    seedDeal("biz_test", customer.id, seedLead("biz_test", customer.id).id, "negotiating", 2_000_000);

    const deals = await service.getDealMetrics(ALL_TIME_RANGE);
    expect(deals.activeDeals).toBe(2);
    expect(deals.pipelineValue).toBe(3_000_000);
    expect(deals.averageAgreedPrice).toBe(1_500_000);
  });

  it("computes averageSaleValue as null with zero sales, and correctly otherwise", async () => {
    const service = getAnalyticsService("biz_test");
    const emptySales = await service.getSalesMetrics(ALL_TIME_RANGE);
    expect(emptySales.averageSaleValue).toBeNull();
    expect(emptySales.highestValueSale).toBeNull();

    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const customer = await customerRepo.createCustomer({ name: "D", phone: "0700000004" });
    const lead = seedLead("biz_test", customer.id);
    const deal = seedDeal("biz_test", customer.id, lead.id, "completed", 900_000);
    seedSale("biz_test", deal.id, customer.id, 850_000);

    const sales = await service.getSalesMetrics(ALL_TIME_RANGE);
    expect(sales.totalSales).toBe(1);
    expect(sales.grossSalesValue).toBe(850_000);
    expect(sales.averageSaleValue).toBe(850_000);
  });

  it("getOverview assembles every metric group scoped to the requesting business only", async () => {
    await makeVehicle("biz_test", "available", 1_000_000);
    const customerRepo = new DatabaseCustomerRepository("biz_test");
    const customer = await customerRepo.createCustomer({ name: "E", phone: "0700000005" });
    seedLead("biz_test", customer.id, "new");

    // Pollute the other business with data that must never leak in.
    await makeVehicle("biz_other", "available", 5_000_000);
    const otherCustomerRepo = new DatabaseCustomerRepository("biz_other");
    const otherCustomer = await otherCustomerRepo.createCustomer({ name: "F", phone: "0700000006" });
    seedLead("biz_other", otherCustomer.id, "new");
    seedLead("biz_other", otherCustomer.id, "new");

    const service = getAnalyticsService("biz_test");
    const overview = await service.getOverview(ALL_TIME_RANGE);

    expect(overview.inventory.totalVehicles).toBe(1);
    expect(overview.crm.totalCustomers).toBe(1);
    expect(overview.crm.totalLeads).toBe(1);
    expect(overview.funnel.totalLeads).toBe(1);
    expect(overview.dateRange).toEqual(ALL_TIME_RANGE);
  });
});

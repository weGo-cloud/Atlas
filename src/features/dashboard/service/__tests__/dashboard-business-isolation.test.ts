import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DashboardService as DashboardServiceClass } from "../dashboard-service";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../../leads/repository/database-lead-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-dashboard-isolation-db-"));
const testDbPath = path.join(testDir, "test.db");

let DashboardService: typeof DashboardServiceClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseLeadRepository: typeof LeadRepoClass;
let rawDb: Database.Database;

const BUSINESS_A = "biz_dash_isolation_a";
const BUSINESS_B = "biz_dash_isolation_b";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  setupDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(BUSINESS_A, "Business A", now, now);
  setupDb
    .prepare("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(BUSINESS_B, "Business B", now, now);
  setupDb.close();

  const serviceModule = await import("../dashboard-service");
  const vehicleRepoModule = await import("../../../inventory/repository/database-vehicle-repository");
  const customerRepoModule = await import("../../../customers/repository/database-customer-repository");
  const leadRepoModule = await import("../../../leads/repository/database-lead-repository");
  DashboardService = serviceModule.DashboardService;
  DatabaseVehicleRepository = vehicleRepoModule.DatabaseVehicleRepository;
  DatabaseCustomerRepository = customerRepoModule.DatabaseCustomerRepository;
  DatabaseLeadRepository = leadRepoModule.DatabaseLeadRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

function serviceFor(businessId: string) {
  return new DashboardService(
    new DatabaseVehicleRepository(businessId),
    new DatabaseCustomerRepository(businessId),
    new DatabaseLeadRepository(businessId)
  );
}

describe("Dashboard business isolation (Mission 012, Phase 7 — critical)", () => {
  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
  });

  it("business A's summary never counts business B's vehicles", async () => {
    const vehicleRepoA = new DatabaseVehicleRepository(BUSINESS_A);
    const vehicleRepoB = new DatabaseVehicleRepository(BUSINESS_B);

    await vehicleRepoA.create({
      make: "Toyota", model: "Vitz", year: 2021, stockId: "DASH-A-0001",
      mileage: 1000, price: 1000000, status: "available", description: "x",
    });
    await vehicleRepoB.create({
      make: "Ferrari", model: "F8", year: 2023, stockId: "DASH-B-0001",
      mileage: 100, price: 50000000, status: "available", description: "x",
    });

    const summaryA = await serviceFor(BUSINESS_A).getSummary();
    expect(summaryA.totalVehicles).toBe(1);
    // If isolation were broken, the massively-priced Ferrari would
    // dominate A's inventory value — confirm it doesn't leak in.
    expect(summaryA.totalInventoryValue).toBe(1000000);
  });

  it("business A's customer/lead summary never counts business B's data", async () => {
    const customerRepoA = new DatabaseCustomerRepository(BUSINESS_A);
    const customerRepoB = new DatabaseCustomerRepository(BUSINESS_B);
    const leadRepoA = new DatabaseLeadRepository(BUSINESS_A);
    const leadRepoB = new DatabaseLeadRepository(BUSINESS_B);

    const customerA = await customerRepoA.createCustomer({ name: "Jane A", phone: "0711111111" });
    await leadRepoA.createLead({ customerId: customerA.id });

    const customerB = await customerRepoB.createCustomer({ name: "John B", phone: "0722222222" });
    await leadRepoB.createLead({ customerId: customerB.id });
    await leadRepoB.createLead({ customerId: customerB.id });

    const summaryA = await serviceFor(BUSINESS_A).getCustomerLeadSummary();
    expect(summaryA.totalCustomers).toBe(1);
    expect(summaryA.newLeads).toBe(1);
  });
});

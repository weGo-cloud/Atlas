import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
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
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-dashboard-db-"));
const testDbPath = path.join(testDir, "test.db");

let DashboardService: typeof DashboardServiceClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseLeadRepository: typeof LeadRepoClass;
let rawDb: Database.Database;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  setupDb.close();

  const serviceModule = await import("../dashboard-service");
  const repoModule = await import("../../../inventory/repository/database-vehicle-repository");
  const customerRepoModule = await import("../../../customers/repository/database-customer-repository");
  const leadRepoModule = await import("../../../leads/repository/database-lead-repository");
  DashboardService = serviceModule.DashboardService;
  DatabaseVehicleRepository = repoModule.DatabaseVehicleRepository;
  DatabaseCustomerRepository = customerRepoModule.DatabaseCustomerRepository;
  DatabaseLeadRepository = leadRepoModule.DatabaseLeadRepository;

  rawDb = new Database(testDbPath);
  // Mission 012: businessId columns FK-reference businesses.id, and
  // foreign_keys enforcement is ON — every row this suite creates
  // with businessId: "biz_test" needs that business to actually exist.
  rawDb.prepare(
    "INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run("biz_test", "Test Business", new Date().toISOString(), new Date().toISOString());
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

async function createVehicle(
  repository: InstanceType<typeof VehicleRepoClass>,
  overrides: {
    stockId: string;
    make?: string;
    model?: string;
    year?: number;
    price?: number;
    status?: "available" | "reserved" | "sold";
  }
) {
  return repository.create({
    make: overrides.make ?? "Toyota",
    model: overrides.model ?? "Vitz",
    year: overrides.year ?? 2021,
    stockId: overrides.stockId,
    mileage: 10000,
    price: overrides.price ?? 1000000,
    status: overrides.status ?? "available",
    description: "A test vehicle.",
  });
}

describe("DashboardService", () => {
  let service: InstanceType<typeof DashboardServiceClass>;
  let repository: InstanceType<typeof VehicleRepoClass>;
  let customerRepository: InstanceType<typeof CustomerRepoClass>;
  let leadRepository: InstanceType<typeof LeadRepoClass>;

  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
    repository = new DatabaseVehicleRepository("biz_test");
    customerRepository = new DatabaseCustomerRepository("biz_test");
    leadRepository = new DatabaseLeadRepository("biz_test");
    service = new DashboardService(repository, customerRepository, leadRepository);
  });

  describe("getSummary — empty inventory", () => {
    it("returns all-zero metrics safely with no vehicles", async () => {
      const summary = await service.getSummary();
      expect(summary).toEqual({
        totalVehicles: 0,
        availableVehicles: 0,
        reservedVehicles: 0,
        soldVehicles: 0,
        totalInventoryValue: 0,
        averageVehiclePrice: 0,
        recentlyAddedCount: 0,
      });
    });
  });

  describe("getSummary — populated inventory", () => {
    beforeEach(async () => {
      await createVehicle(repository, { stockId: "S-0001", status: "available", price: 1000000 });
      await createVehicle(repository, { stockId: "S-0002", status: "available", price: 2000000 });
      await createVehicle(repository, { stockId: "S-0003", status: "reserved", price: 3000000 });
      await createVehicle(repository, { stockId: "S-0004", status: "sold", price: 9000000 });
    });

    it("counts total vehicles correctly", async () => {
      const summary = await service.getSummary();
      expect(summary.totalVehicles).toBe(4);
    });

    it("counts available vehicles correctly", async () => {
      const summary = await service.getSummary();
      expect(summary.availableVehicles).toBe(2);
    });

    it("counts reserved vehicles correctly", async () => {
      const summary = await service.getSummary();
      expect(summary.reservedVehicles).toBe(1);
    });

    it("counts sold vehicles correctly", async () => {
      const summary = await service.getSummary();
      expect(summary.soldVehicles).toBe(1);
    });

    it("excludes sold vehicles from total inventory value", async () => {
      const summary = await service.getSummary();
      // available (1,000,000 + 2,000,000) + reserved (3,000,000) = 6,000,000
      // the sold 9,000,000 vehicle must NOT be included
      expect(summary.totalInventoryValue).toBe(6000000);
    });

    it("excludes sold vehicles from average price", async () => {
      const summary = await service.getSummary();
      // (1,000,000 + 2,000,000 + 3,000,000) / 3 active vehicles = 2,000,000
      expect(summary.averageVehiclePrice).toBe(2000000);
    });

    it("counts vehicles added within the recent window", async () => {
      const summary = await service.getSummary();
      // All 4 were just created in this test, so all fall within the window.
      expect(summary.recentlyAddedCount).toBe(4);
    });
  });

  describe("getSummary — business rule: all-sold inventory", () => {
    it("returns zero value/average when every vehicle is sold, without dividing by zero", async () => {
      await createVehicle(repository, { stockId: "AS-0001", status: "sold", price: 5000000 });
      await createVehicle(repository, { stockId: "AS-0002", status: "sold", price: 7000000 });

      const summary = await service.getSummary();
      expect(summary.totalVehicles).toBe(2);
      expect(summary.soldVehicles).toBe(2);
      expect(summary.totalInventoryValue).toBe(0);
      expect(summary.averageVehiclePrice).toBe(0);
    });
  });

  describe("getStatusBreakdown", () => {
    it("returns zero counts for every status on an empty inventory", async () => {
      const breakdown = await service.getStatusBreakdown();
      expect(breakdown).toEqual([
        { status: "available", label: "Available", count: 0 },
        { status: "reserved", label: "Reserved", count: 0 },
        { status: "sold", label: "Sold", count: 0 },
      ]);
    });

    it("reflects actual per-status counts", async () => {
      await createVehicle(repository, { stockId: "SB-0001", status: "available" });
      await createVehicle(repository, { stockId: "SB-0002", status: "available" });
      await createVehicle(repository, { stockId: "SB-0003", status: "reserved" });

      const breakdown = await service.getStatusBreakdown();
      const byStatus = Object.fromEntries(breakdown.map((b) => [b.status, b.count]));
      expect(byStatus.available).toBe(2);
      expect(byStatus.reserved).toBe(1);
      expect(byStatus.sold).toBe(0);
    });
  });

  describe("getMakeBreakdown", () => {
    it("returns an empty array for an empty inventory", async () => {
      const breakdown = await service.getMakeBreakdown();
      expect(breakdown).toEqual([]);
    });

    it("orders makes by count, highest first", async () => {
      await createVehicle(repository, { stockId: "MB-0001", make: "Toyota" });
      await createVehicle(repository, { stockId: "MB-0002", make: "Toyota" });
      await createVehicle(repository, { stockId: "MB-0003", make: "Toyota" });
      await createVehicle(repository, { stockId: "MB-0004", make: "Honda" });
      await createVehicle(repository, { stockId: "MB-0005", make: "Honda" });
      await createVehicle(repository, { stockId: "MB-0006", make: "Mazda" });

      const breakdown = await service.getMakeBreakdown();
      expect(breakdown[0]).toEqual({ make: "Toyota", count: 3 });
      expect(breakdown[1]).toEqual({ make: "Honda", count: 2 });
      expect(breakdown[2]).toEqual({ make: "Mazda", count: 1 });
    });

    it("respects the limit argument", async () => {
      await createVehicle(repository, { stockId: "MBL-0001", make: "Toyota" });
      await createVehicle(repository, { stockId: "MBL-0002", make: "Honda" });
      await createVehicle(repository, { stockId: "MBL-0003", make: "Mazda" });
      await createVehicle(repository, { stockId: "MBL-0004", make: "Nissan" });

      const breakdown = await service.getMakeBreakdown(2);
      expect(breakdown).toHaveLength(2);
    });
  });

  describe("getRecentlyAdded", () => {
    it("returns an empty array for an empty inventory", async () => {
      const recent = await service.getRecentlyAdded();
      expect(recent).toEqual([]);
    });

    it("orders newest first", async () => {
      const first = await createVehicle(repository, { stockId: "RA-0001" });
      // Ensure a distinguishable addedAt ordering — the repository
      // stamps addedAt with the current timestamp on create, and
      // successive creates a moment apart should sort newest-first.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await createVehicle(repository, { stockId: "RA-0002" });

      const recent = await service.getRecentlyAdded();
      expect(recent[0].id).toBe(second.id);
      expect(recent[1].id).toBe(first.id);
    });

    it("respects the limit argument", async () => {
      for (let i = 0; i < 8; i++) {
        await createVehicle(repository, { stockId: `RAL-000${i}` });
      }
      const recent = await service.getRecentlyAdded(3);
      expect(recent).toHaveLength(3);
    });
  });

  describe("getCustomerLeadSummary", () => {
    it("returns zeros with no customers or leads", async () => {
      const summary = await service.getCustomerLeadSummary();
      expect(summary).toEqual({
        totalCustomers: 0,
        newLeads: 0,
        activeLeads: 0,
        closedLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        conversionRate: null,
      });
    });

    it("buckets lead statuses correctly", async () => {
      const customer = await customerRepository.createCustomer({ name: "Jane Doe", phone: "0700000000" });
      const vehicle = await createVehicle(repository, { stockId: "CLS-0001" });

      await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id, status: "new" });
      await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id, status: "contacted" });
      await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id, status: "qualified" });
      await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id, status: "negotiating" });
      await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id, status: "won" });
      await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id, status: "lost" });

      const summary = await service.getCustomerLeadSummary();
      expect(summary.totalCustomers).toBe(1);
      expect(summary.newLeads).toBe(1);
      // active = new + contacted + qualified + negotiating = 4
      expect(summary.activeLeads).toBe(4);
      // closed = won + lost = 2
      expect(summary.closedLeads).toBe(2);
      expect(summary.wonLeads).toBe(1);
      expect(summary.lostLeads).toBe(1);
      // conversionRate = won / (won + lost) = 1/2
      expect(summary.conversionRate).toBe(0.5);
    });

    it("conversionRate is null when no lead has been decided yet", async () => {
      const customer = await customerRepository.createCustomer({ name: "Jane Doe", phone: "0700000000" });
      await leadRepository.createLead({ customerId: customer.id, status: "new" });

      const summary = await service.getCustomerLeadSummary();
      expect(summary.conversionRate).toBeNull();
    });
  });

  describe("getMostInterestedVehicles", () => {
    it("returns an empty array when there are no leads", async () => {
      const result = await service.getMostInterestedVehicles();
      expect(result).toEqual([]);
    });

    it("ranks vehicles by lead count, highest first", async () => {
      const customer = await customerRepository.createCustomer({ name: "Jane Doe", phone: "0700000000" });
      const popular = await createVehicle(repository, { stockId: "MIV-0001" });
      const lessPopular = await createVehicle(repository, { stockId: "MIV-0002" });

      await leadRepository.createLead({ customerId: customer.id, vehicleId: popular.id });
      await leadRepository.createLead({ customerId: customer.id, vehicleId: popular.id });
      await leadRepository.createLead({ customerId: customer.id, vehicleId: lessPopular.id });

      const result = await service.getMostInterestedVehicles();
      expect(result[0].vehicle.id).toBe(popular.id);
      expect(result[0].leadCount).toBe(2);
      expect(result[1].vehicle.id).toBe(lessPopular.id);
      expect(result[1].leadCount).toBe(1);
    });

    it("excludes leads with no vehicle reference", async () => {
      const customer = await customerRepository.createCustomer({ name: "Jane Doe", phone: "0700000000" });
      await leadRepository.createLead({ customerId: customer.id, vehicleId: null });

      const result = await service.getMostInterestedVehicles();
      expect(result).toEqual([]);
    });
  });

  describe("getRecentLeads", () => {
    it("returns an empty array when there are no leads", async () => {
      const result = await service.getRecentLeads();
      expect(result).toEqual([]);
    });

    it("orders newest first and respects the limit", async () => {
      const customer = await customerRepository.createCustomer({ name: "Jane Doe", phone: "0700000000" });
      const first = await leadRepository.createLead({ customerId: customer.id, vehicleId: null });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await leadRepository.createLead({ customerId: customer.id, vehicleId: null });

      const result = await service.getRecentLeads(1);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(second.id);
      expect(result[0].id).not.toBe(first.id);
    });
  });
});

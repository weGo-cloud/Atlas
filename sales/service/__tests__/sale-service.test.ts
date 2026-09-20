import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { SaleService as SaleServiceClass } from "../sale-service";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../../leads/repository/database-lead-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";
import type { DealService as DealServiceClass } from "../../../deals/service/deal-service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-sale-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let getSaleService: (businessId: string) => InstanceType<typeof SaleServiceClass>;
let getDealService: (businessId: string) => InstanceType<typeof DealServiceClass>;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseLeadRepository: typeof LeadRepoClass;
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

  getSaleService = (await import("../index")).getSaleService;
  getDealService = (await import("../../../deals/service")).getDealService;
  DatabaseCustomerRepository = (await import("../../../customers/repository/database-customer-repository"))
    .DatabaseCustomerRepository;
  DatabaseLeadRepository = (await import("../../../leads/repository/database-lead-repository")).DatabaseLeadRepository;
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

async function makeCustomer(businessId: string) {
  return new DatabaseCustomerRepository(businessId).createCustomer({ name: "Test Customer", phone: "0700000000" });
}

async function makeVehicle(businessId: string, stockId: string, price = 1_000_000) {
  return new DatabaseVehicleRepository(businessId).create({
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId,
    mileage: 10000,
    price,
    status: "available",
    description: "Test vehicle.",
  });
}

async function makeLead(businessId: string, customerId: string, vehicleId?: string) {
  return new DatabaseLeadRepository(businessId).createLead({ customerId, vehicleId: vehicleId ?? null });
}

/** Drives a deal all the way to "completed" through the real DealService, so the vehicle ends up "sold" the same way production traffic does. */
async function makeCompletedDeal(
  dealService: InstanceType<typeof DealServiceClass>,
  leadId: string,
  agreedPrice?: number
) {
  const created = await dealService.createDeal({ leadId, agreedPrice });
  if (!created.ok) throw new Error("setup: could not create deal");
  await dealService.updateDealStatus(created.data.id, "negotiating");
  await dealService.updateDealStatus(created.data.id, "reserved");
  const completed = await dealService.updateDealStatus(created.data.id, "completed");
  if (!completed.ok) throw new Error("setup: could not complete deal");
  return completed.data;
}

describe("SaleService", () => {
  let saleService: InstanceType<typeof SaleServiceClass>;
  let dealService: InstanceType<typeof DealServiceClass>;

  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
    saleService = getSaleService("biz_test");
    dealService = getDealService("biz_test");
  });

  describe("createSale", () => {
    it("creates a sale from a completed deal, defaulting the amount to the deal's agreed price", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-1", 1_200_000);
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const deal = await makeCompletedDeal(dealService, lead.id);

      const result = await saleService.createSale({ dealId: deal.id });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.customerId).toBe(customer.id);
      expect(result.data.vehicleId).toBe(vehicle.id);
      expect(result.data.saleAmount).toBe(deal.agreedPrice);
    });

    it("accepts an explicit sale amount overriding the deal's agreed price", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-2");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const deal = await makeCompletedDeal(dealService, lead.id, 900_000);

      const result = await saleService.createSale({ dealId: deal.id, saleAmount: 875_000 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.saleAmount).toBe(875_000);
    });

    it("rejects a non-existent deal", async () => {
      const result = await saleService.createSale({ dealId: "deal_missing" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("DEAL_NOT_FOUND");
    });

    it("rejects a foreign-business deal", async () => {
      const otherCustomer = await makeCustomer("biz_other");
      const otherVehicle = await makeVehicle("biz_other", "STK-OTHER-1");
      const otherLead = await makeLead("biz_other", otherCustomer.id, otherVehicle.id);
      const otherDealService = getDealService("biz_other");
      const otherDeal = await makeCompletedDeal(otherDealService, otherLead.id);

      const result = await saleService.createSale({ dealId: otherDeal.id });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("DEAL_NOT_FOUND");
    });

    it.each(["draft", "negotiating", "reserved", "cancelled"] as const)(
      "rejects a deal that is only '%s'",
      async (status) => {
        const customer = await makeCustomer("biz_test");
        const vehicle = await makeVehicle("biz_test", `STK-STATUS-${status}`);
        const lead = await makeLead("biz_test", customer.id, vehicle.id);
        const created = await dealService.createDeal({ leadId: lead.id });
        if (!created.ok) throw new Error("setup failed");

        if (status === "negotiating" || status === "reserved" || status === "cancelled") {
          await dealService.updateDealStatus(created.data.id, "negotiating");
        }
        if (status === "reserved") {
          await dealService.updateDealStatus(created.data.id, "reserved");
        }
        if (status === "cancelled") {
          await dealService.updateDealStatus(created.data.id, "cancelled");
        }

        const result = await saleService.createSale({ dealId: created.data.id });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe("DEAL_NOT_COMPLETED");
      }
    );

    it("rejects creating a second sale for the same deal", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-3");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const deal = await makeCompletedDeal(dealService, lead.id);

      const first = await saleService.createSale({ dealId: deal.id });
      expect(first.ok).toBe(true);

      const second = await saleService.createSale({ dealId: deal.id });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.code).toBe("DUPLICATE_SALE");
    });

    it("rejects a sale when the vehicle isn't actually marked sold (data-integrity guard)", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-4");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const deal = await makeCompletedDeal(dealService, lead.id);

      // Force the vehicle back to "available" out from under the deal
      // — simulates the anomaly this check exists to catch.
      const vehicleRepo = new DatabaseVehicleRepository("biz_test");
      await vehicleRepo.update(vehicle.id, { status: "available" });

      const result = await saleService.createSale({ dealId: deal.id });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VEHICLE_NOT_FINALIZED");
    });

    it("never mutates the vehicle's listing price or status", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-5", 1_000_000);
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const deal = await makeCompletedDeal(dealService, lead.id, 850_000);

      await saleService.createSale({ dealId: deal.id, saleAmount: 800_000 });

      const vehicleRepo = new DatabaseVehicleRepository("biz_test");
      const vehicleAfter = await vehicleRepo.getById(vehicle.id);
      expect(vehicleAfter?.price).toBe(1_000_000);
      expect(vehicleAfter?.status).toBe("sold");
    });
  });

  describe("concurrency", () => {
    it("two concurrent sale creations against the same completed deal: exactly one succeeds", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-7");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const deal = await makeCompletedDeal(dealService, lead.id);

      const [a, b] = await Promise.all([
        saleService.createSale({ dealId: deal.id }),
        saleService.createSale({ dealId: deal.id }),
      ]);

      const successes = [a, b].filter((r) => r.ok);
      expect(successes).toHaveLength(1);
    });

    it("two completed deals racing to sell the same vehicle: exactly one sale succeeds", async () => {
      // Simulates Scenario B directly: two deals independently
      // completed, then forced (via raw SQL) to reference the same
      // vehicle. This exact double state shouldn't arise through
      // normal DealService traffic (Mission 018.1 already prevents
      // two deals from both reserving the same vehicle), so it's
      // simulated here to prove SaleService's own defense-in-depth —
      // the unique index on sales.vehicleId — still holds even if
      // that upstream invariant were ever violated.
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-8");
      const leadA = await makeLead("biz_test", customer.id, vehicle.id);
      const dealA = await makeCompletedDeal(dealService, leadA.id);

      const otherVehicle = await makeVehicle("biz_test", "STK-8B");
      const leadB = await makeLead("biz_test", customer.id, otherVehicle.id);
      const createdB = await dealService.createDeal({ leadId: leadB.id });
      if (!createdB.ok) throw new Error("setup failed");
      rawDb
        .prepare("UPDATE deals SET vehicle_id = ?, status = 'completed' WHERE id = ?")
        .run(vehicle.id, createdB.data.id);

      const [a, b] = await Promise.all([
        saleService.createSale({ dealId: dealA.id }),
        saleService.createSale({ dealId: createdB.data.id }),
      ]);

      const successes = [a, b].filter((r) => r.ok);
      expect(successes).toHaveLength(1);
    });
  });
});

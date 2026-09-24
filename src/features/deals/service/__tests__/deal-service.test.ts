import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DealService as DealServiceClass } from "../deal-service";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../../leads/repository/database-lead-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-deal-service-db-"));
const testDbPath = path.join(testDir, "test.db");

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

  getDealService = (await import("../index")).getDealService;
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

async function makeCustomer(businessId: string, name = "Test Customer") {
  return new DatabaseCustomerRepository(businessId).createCustomer({ name, phone: "0700000000" });
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

describe("DealService", () => {
  let dealService: InstanceType<typeof DealServiceClass>;

  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
    dealService = getDealService("biz_test");
  });

  describe("createDeal", () => {
    it("creates a deal from a valid lead, deriving the customer from the lead", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-1", 1_200_000);
      const lead = await makeLead("biz_test", customer.id, vehicle.id);

      const result = await dealService.createDeal({ leadId: lead.id });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.customerId).toBe(customer.id);
      expect(result.data.vehicleId).toBe(vehicle.id);
      // Defaults to the vehicle's listing price when not supplied.
      expect(result.data.agreedPrice).toBe(1_200_000);
      expect(result.data.status).toBe("draft");
    });

    it("rejects a non-existent lead", async () => {
      const result = await dealService.createDeal({ leadId: "lead_missing" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("LEAD_NOT_FOUND");
    });

    it("rejects a foreign-business lead — cross-business creation is blocked", async () => {
      const otherCustomer = await makeCustomer("biz_other");
      const otherLead = await makeLead("biz_other", otherCustomer.id);

      const result = await dealService.createDeal({ leadId: otherLead.id });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("LEAD_NOT_FOUND");
    });

    it("requires a vehicle when the lead has none and none is supplied", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = await makeLead("biz_test", customer.id);

      const result = await dealService.createDeal({ leadId: lead.id });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VEHICLE_REQUIRED");
    });

    it("accepts an explicit vehicleId overriding the lead's own vehicle of interest", async () => {
      const customer = await makeCustomer("biz_test");
      const leadVehicle = await makeVehicle("biz_test", "STK-2");
      const otherVehicle = await makeVehicle("biz_test", "STK-3");
      const lead = await makeLead("biz_test", customer.id, leadVehicle.id);

      const result = await dealService.createDeal({ leadId: lead.id, vehicleId: otherVehicle.id });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.vehicleId).toBe(otherVehicle.id);
    });

    it("rejects a foreign-business vehicle even when explicitly supplied", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = await makeLead("biz_test", customer.id);
      const otherCustomer = await makeCustomer("biz_other");
      const foreignVehicle = await makeVehicle("biz_other", "STK-4");
      await makeLead("biz_other", otherCustomer.id, foreignVehicle.id);

      const result = await dealService.createDeal({ leadId: lead.id, vehicleId: foreignVehicle.id });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
    });

    it("rejects a deposit that exceeds the agreed price", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-5", 500_000);
      const lead = await makeLead("biz_test", customer.id, vehicle.id);

      const result = await dealService.createDeal({
        leadId: lead.id,
        agreedPrice: 400_000,
        depositAmount: 450_000,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a negative or non-integer agreed price", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-6");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);

      const result = await dealService.createDeal({ leadId: lead.id, agreedPrice: -1 });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects creating a second active deal for a lead that already has one", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-7");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);

      const first = await dealService.createDeal({ leadId: lead.id });
      expect(first.ok).toBe(true);

      const second = await dealService.createDeal({ leadId: lead.id });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.code).toBe("DUPLICATE_ACTIVE_DEAL");
    });

    it("allows a new deal once the previous one for the same lead is cancelled", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-8");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);

      const first = await dealService.createDeal({ leadId: lead.id });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      await dealService.updateDealStatus(first.data.id, "cancelled");

      const second = await dealService.createDeal({ leadId: lead.id });
      expect(second.ok).toBe(true);
    });
  });

  describe("updateDealStatus", () => {
    it("rejects an invalid transition", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-9");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id });
      if (!created.ok) throw new Error("setup failed");

      const result = await dealService.updateDealStatus(created.data.id, "completed");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("reserving a deal reserves its vehicle", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-10");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id });
      if (!created.ok) throw new Error("setup failed");

      await dealService.updateDealStatus(created.data.id, "negotiating");
      const reserved = await dealService.updateDealStatus(created.data.id, "reserved");
      expect(reserved.ok).toBe(true);

      const vehicleRepo = new DatabaseVehicleRepository("biz_test");
      const updatedVehicle = await vehicleRepo.getById(vehicle.id);
      expect(updatedVehicle?.status).toBe("reserved");
    });

    it("blocks reserving a deal whose vehicle is already reserved under a different deal", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-11");
      const leadA = await makeLead("biz_test", customer.id, vehicle.id);
      const dealA = await dealService.createDeal({ leadId: leadA.id });
      if (!dealA.ok) throw new Error("setup failed");
      await dealService.updateDealStatus(dealA.data.id, "negotiating");
      await dealService.updateDealStatus(dealA.data.id, "reserved");

      const leadB = await makeLead("biz_test", customer.id, vehicle.id);
      const dealB = await dealService.createDeal({ leadId: leadB.id });
      if (!dealB.ok) throw new Error("setup failed");
      await dealService.updateDealStatus(dealB.data.id, "negotiating");

      const result = await dealService.updateDealStatus(dealB.data.id, "reserved");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VEHICLE_UNAVAILABLE");
    });

    it("completing a reserved deal marks its vehicle sold", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-12");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id });
      if (!created.ok) throw new Error("setup failed");
      await dealService.updateDealStatus(created.data.id, "negotiating");
      await dealService.updateDealStatus(created.data.id, "reserved");

      const completed = await dealService.updateDealStatus(created.data.id, "completed");
      expect(completed.ok).toBe(true);

      const vehicleRepo = new DatabaseVehicleRepository("biz_test");
      const updatedVehicle = await vehicleRepo.getById(vehicle.id);
      expect(updatedVehicle?.status).toBe("sold");
    });

    it("cancelling a reserved deal releases its vehicle back to available", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-13");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id });
      if (!created.ok) throw new Error("setup failed");
      await dealService.updateDealStatus(created.data.id, "negotiating");
      await dealService.updateDealStatus(created.data.id, "reserved");

      const cancelled = await dealService.updateDealStatus(created.data.id, "cancelled");
      expect(cancelled.ok).toBe(true);

      const vehicleRepo = new DatabaseVehicleRepository("biz_test");
      const updatedVehicle = await vehicleRepo.getById(vehicle.id);
      expect(updatedVehicle?.status).toBe("available");
    });
  });

  describe("updateDeal", () => {
    it("rejects edits to a completed deal", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-14");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id });
      if (!created.ok) throw new Error("setup failed");
      await dealService.updateDealStatus(created.data.id, "negotiating");
      await dealService.updateDealStatus(created.data.id, "reserved");
      await dealService.updateDealStatus(created.data.id, "completed");

      const result = await dealService.updateDeal(created.data.id, { notes: "rewrite history" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VALIDATION_ERROR");
    });

    it("allows editing an active deal's price and notes", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "STK-15");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id });
      if (!created.ok) throw new Error("setup failed");

      const result = await dealService.updateDeal(created.data.id, {
        agreedPrice: 850_000,
        notes: "Negotiated down.",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.agreedPrice).toBe(850_000);
      expect(result.data.notes).toBe("Negotiated down.");
    });
  });
});

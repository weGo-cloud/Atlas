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
import type { DatabaseDealRepository as DealRepoClass } from "../../repository/database-deal-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-deal-atomicity-db-"));
const testDbPath = path.join(testDir, "test.db");

let getDealService: (businessId: string) => InstanceType<typeof DealServiceClass>;
let DatabaseDealRepository: typeof DealRepoClass;
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
  DatabaseDealRepository = (await import("../../repository/database-deal-repository")).DatabaseDealRepository;
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

/** Advances a fresh deal from draft to negotiating, so it's eligible to attempt "reserved" next. */
async function toNegotiating(dealService: InstanceType<typeof DealServiceClass>, dealId: string) {
  const result = await dealService.updateDealStatus(dealId, "negotiating");
  if (!result.ok) throw new Error("setup: could not move deal to negotiating");
  return result.data;
}

describe("Mission 018.1 — Deal/Vehicle atomicity and concurrency", () => {
  let dealService: InstanceType<typeof DealServiceClass>;
  let dealRepository: InstanceType<typeof DealRepoClass>;
  let vehicleRepository: InstanceType<typeof VehicleRepoClass>;

  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
    dealService = getDealService("biz_test");
    dealRepository = new DatabaseDealRepository("biz_test");
    vehicleRepository = new DatabaseVehicleRepository("biz_test");
  });

  describe("vehicle reservation", () => {
    it("Deal A reserves Vehicle X; Deal B cannot reserve Vehicle X afterward", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "RES-1");
      const leadA = await makeLead("biz_test", customer.id, vehicle.id);
      const leadB = await makeLead("biz_test", customer.id, vehicle.id);

      const dealA = await dealService.createDeal({ leadId: leadA.id });
      const dealB = await dealService.createDeal({ leadId: leadB.id });
      if (!dealA.ok || !dealB.ok) throw new Error("setup failed");

      await toNegotiating(dealService, dealA.data.id);
      await toNegotiating(dealService, dealB.data.id);

      const reservedA = await dealService.updateDealStatus(dealA.data.id, "reserved");
      expect(reservedA.ok).toBe(true);

      const reservedB = await dealService.updateDealStatus(dealB.data.id, "reserved");
      expect(reservedB.ok).toBe(false);
      if (!reservedB.ok) expect(reservedB.error.code).toBe("VEHICLE_UNAVAILABLE");

      // Deal B's own status must be unchanged by the rejected attempt.
      const dealBAfter = await dealRepository.getDealById(dealB.data.id);
      expect(dealBAfter?.status).toBe("negotiating");
    });

    it("concurrent reservation attempts on the same vehicle: exactly one succeeds", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "RES-2");
      const leadA = await makeLead("biz_test", customer.id, vehicle.id);
      const leadB = await makeLead("biz_test", customer.id, vehicle.id);

      const dealA = await dealService.createDeal({ leadId: leadA.id });
      const dealB = await dealService.createDeal({ leadId: leadB.id });
      if (!dealA.ok || !dealB.ok) throw new Error("setup failed");
      await toNegotiating(dealService, dealA.data.id);
      await toNegotiating(dealService, dealB.data.id);

      const [resultA, resultB] = await Promise.all([
        dealService.updateDealStatus(dealA.data.id, "reserved"),
        dealService.updateDealStatus(dealB.data.id, "reserved"),
      ]);

      const successes = [resultA, resultB].filter((r) => r.ok);
      expect(successes).toHaveLength(1);

      const finalVehicle = await vehicleRepository.getById(vehicle.id);
      expect(finalVehicle?.status).toBe("reserved");
    });
  });

  describe("vehicle completion", () => {
    it("Deal A completes Vehicle X; Deal B cannot subsequently reserve/complete against Vehicle X", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "COMP-1");
      const leadA = await makeLead("biz_test", customer.id, vehicle.id);
      const leadB = await makeLead("biz_test", customer.id, vehicle.id);

      const dealA = await dealService.createDeal({ leadId: leadA.id });
      const dealB = await dealService.createDeal({ leadId: leadB.id });
      if (!dealA.ok || !dealB.ok) throw new Error("setup failed");

      await toNegotiating(dealService, dealA.data.id);
      await dealService.updateDealStatus(dealA.data.id, "reserved");
      const completedA = await dealService.updateDealStatus(dealA.data.id, "completed");
      expect(completedA.ok).toBe(true);

      await toNegotiating(dealService, dealB.data.id);
      const reservedB = await dealService.updateDealStatus(dealB.data.id, "reserved");
      expect(reservedB.ok).toBe(false);
      if (!reservedB.ok) expect(reservedB.error.code).toBe("VEHICLE_UNAVAILABLE");
    });

    it("rejects completion when the vehicle is already sold (Mission 018.1, Section 3) rather than silently skipping", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "COMP-2");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id });
      if (!created.ok) throw new Error("setup failed");
      await toNegotiating(dealService, created.data.id);
      await dealService.updateDealStatus(created.data.id, "reserved");

      // Simulate the vehicle having been resolved through another
      // transaction entirely (a direct mutation, bypassing Deal).
      await vehicleRepository.update(vehicle.id, { status: "sold" });

      const completed = await dealService.updateDealStatus(created.data.id, "completed");
      expect(completed.ok).toBe(false);
      if (!completed.ok) expect(completed.error.code).toBe("VEHICLE_UNAVAILABLE");

      // The deal must remain exactly where it was — no partial state.
      const dealAfter = await dealRepository.getDealById(created.data.id);
      expect(dealAfter?.status).toBe("reserved");
    });

    it("concurrent completion attempts against the same reserved deal: only one succeeds", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "COMP-3");
      const leadA = await makeLead("biz_test", customer.id, vehicle.id);
      const dealA = await dealService.createDeal({ leadId: leadA.id });
      if (!dealA.ok) throw new Error("setup failed");
      await toNegotiating(dealService, dealA.data.id);
      await dealService.updateDealStatus(dealA.data.id, "reserved");

      const [a, b] = await Promise.all([
        dealService.updateDealStatus(dealA.data.id, "completed"),
        dealService.updateDealStatus(dealA.data.id, "completed"),
      ]);

      const successes = [a, b].filter((r) => r.ok);
      expect(successes).toHaveLength(1);

      const finalVehicle = await vehicleRepository.getById(vehicle.id);
      expect(finalVehicle?.status).toBe("sold");
    });
  });

  describe("atomicity — no partial state on a rejected required vehicle transition", () => {
    it("leaves both Deal and Vehicle state unchanged when the required vehicle transition is rejected", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "ATOMIC-1");
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id });
      if (!created.ok) throw new Error("setup failed");
      await toNegotiating(dealService, created.data.id);

      // Force the vehicle into "sold" out from under the deal.
      await vehicleRepository.update(vehicle.id, { status: "sold" });

      const attempt = await dealService.updateDealStatus(created.data.id, "reserved");
      expect(attempt.ok).toBe(false);

      const dealAfter = await dealRepository.getDealById(created.data.id);
      const vehicleAfter = await vehicleRepository.getById(vehicle.id);
      expect(dealAfter?.status).toBe("negotiating");
      expect(vehicleAfter?.status).toBe("sold");
    });
  });

  describe("vehicle listing price independence", () => {
    it("completing a deal at a negotiated price never changes the vehicle's listing price", async () => {
      const customer = await makeCustomer("biz_test");
      const vehicle = await makeVehicle("biz_test", "PRICE-1", 1_000_000);
      const lead = await makeLead("biz_test", customer.id, vehicle.id);
      const created = await dealService.createDeal({ leadId: lead.id, agreedPrice: 850_000 });
      if (!created.ok) throw new Error("setup failed");

      await dealService.updateDeal(created.data.id, { agreedPrice: 800_000 });
      await toNegotiating(dealService, created.data.id);
      await dealService.updateDealStatus(created.data.id, "reserved");
      await dealService.updateDealStatus(created.data.id, "completed");

      const vehicleAfter = await vehicleRepository.getById(vehicle.id);
      expect(vehicleAfter?.price).toBe(1_000_000);

      const dealAfter = await dealRepository.getDealById(created.data.id);
      expect(dealAfter?.agreedPrice).toBe(800_000);
    });
  });
});

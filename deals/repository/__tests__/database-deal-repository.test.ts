import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseDealRepository as DealRepoClass } from "../database-deal-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../../leads/repository/database-lead-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-deal-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseDealRepository: typeof DealRepoClass;
let DuplicateActiveDealError: new () => Error;
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

  const dealRepoModule = await import("../database-deal-repository");
  DatabaseDealRepository = dealRepoModule.DatabaseDealRepository;
  DuplicateActiveDealError = dealRepoModule.DuplicateActiveDealError;
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

async function makeVehicle(businessId: string, stockId: string) {
  return new DatabaseVehicleRepository(businessId).create({
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId,
    mileage: 10000,
    price: 1_000_000,
    status: "available",
    description: "Test vehicle.",
  });
}

async function makeLead(businessId: string, customerId: string, vehicleId?: string) {
  return new DatabaseLeadRepository(businessId).createLead({ customerId, vehicleId: vehicleId ?? null });
}

describe("DatabaseDealRepository", () => {
  let dealRepository: InstanceType<typeof DealRepoClass>;
  let otherBusinessDealRepository: InstanceType<typeof DealRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;");
    dealRepository = new DatabaseDealRepository("biz_test");
    otherBusinessDealRepository = new DatabaseDealRepository("biz_other");
  });

  it("creates and retrieves a deal", async () => {
    const customer = await makeCustomer("biz_test");
    const vehicle = await makeVehicle("biz_test", "STK-1");
    const lead = await makeLead("biz_test", customer.id, vehicle.id);

    const deal = await dealRepository.createDeal({
      customerId: customer.id,
      leadId: lead.id,
      vehicleId: vehicle.id,
      vehicleLabel: "2021 Toyota Vitz",
      agreedPrice: 950_000,
      depositAmount: 100_000,
      notes: "First deal.",
    });

    expect(deal.status).toBe("draft");
    expect(deal.agreedPrice).toBe(950_000);
    expect(deal.depositAmount).toBe(100_000);

    const fetched = await dealRepository.getDealById(deal.id);
    expect(fetched).toEqual(deal);
  });

  it("enforces the partial unique index — a second non-terminal deal for the same lead is rejected", async () => {
    const customer = await makeCustomer("biz_test");
    const vehicle = await makeVehicle("biz_test", "STK-2");
    const lead = await makeLead("biz_test", customer.id, vehicle.id);

    await dealRepository.createDeal({
      customerId: customer.id,
      leadId: lead.id,
      vehicleId: vehicle.id,
      vehicleLabel: "2021 Toyota Vitz",
      agreedPrice: 900_000,
    });

    await expect(
      dealRepository.createDeal({
        customerId: customer.id,
        leadId: lead.id,
        vehicleId: vehicle.id,
        vehicleLabel: "2021 Toyota Vitz",
        agreedPrice: 900_000,
      })
    ).rejects.toBeInstanceOf(DuplicateActiveDealError);
  });

  it("allows a new deal for the same lead once the previous one is terminal", async () => {
    const customer = await makeCustomer("biz_test");
    const vehicle = await makeVehicle("biz_test", "STK-3");
    const lead = await makeLead("biz_test", customer.id, vehicle.id);

    const first = await dealRepository.createDeal({
      customerId: customer.id,
      leadId: lead.id,
      vehicleId: vehicle.id,
      vehicleLabel: "2021 Toyota Vitz",
      agreedPrice: 900_000,
    });
    await dealRepository.updateDealStatus(first.id, "draft", "cancelled");

    const second = await dealRepository.createDeal({
      customerId: customer.id,
      leadId: lead.id,
      vehicleId: vehicle.id,
      vehicleLabel: "2021 Toyota Vitz",
      agreedPrice: 880_000,
    });
    expect(second.id).not.toBe(first.id);
  });

  it("updateDealStatus is an atomic conditional update — it fails when the expected current status doesn't match", async () => {
    const customer = await makeCustomer("biz_test");
    const lead = await makeLead("biz_test", customer.id);
    const deal = await dealRepository.createDeal({
      customerId: customer.id,
      leadId: lead.id,
      vehicleId: null,
      vehicleLabel: null,
      agreedPrice: 900_000,
    });

    // deal.status is actually "draft" — asserting a wrong expected
    // status must not apply the update.
    const result = await dealRepository.updateDealStatus(deal.id, "negotiating", "cancelled");
    expect(result).toBeNull();

    const stillDraft = await dealRepository.getDealById(deal.id);
    expect(stillDraft?.status).toBe("draft");
  });

  it("updateDealStatus wins a simulated concurrent race exactly once", async () => {
    const customer = await makeCustomer("biz_test");
    const lead = await makeLead("biz_test", customer.id);
    const deal = await dealRepository.createDeal({
      customerId: customer.id,
      leadId: lead.id,
      vehicleId: null,
      vehicleLabel: null,
      agreedPrice: 900_000,
    });

    const [a, b] = await Promise.all([
      dealRepository.updateDealStatus(deal.id, "draft", "negotiating"),
      dealRepository.updateDealStatus(deal.id, "draft", "cancelled"),
    ]);

    const results = [a, b];
    const winners = results.filter((r) => r !== null);
    expect(winners).toHaveLength(1);
  });

  it("getActiveDealForLead returns the non-terminal deal only", async () => {
    const customer = await makeCustomer("biz_test");
    const lead = await makeLead("biz_test", customer.id);
    const deal = await dealRepository.createDeal({
      customerId: customer.id,
      leadId: lead.id,
      vehicleId: null,
      vehicleLabel: null,
      agreedPrice: 900_000,
    });

    expect((await dealRepository.getActiveDealForLead(lead.id))?.id).toBe(deal.id);

    await dealRepository.updateDealStatus(deal.id, "draft", "cancelled");
    expect(await dealRepository.getActiveDealForLead(lead.id)).toBeNull();
  });

  it("filters by status and paginates results", async () => {
    const customer = await makeCustomer("biz_test");
    for (let i = 0; i < 3; i += 1) {
      const lead = await makeLead("biz_test", customer.id);
      await dealRepository.createDeal({
        customerId: customer.id,
        leadId: lead.id,
        vehicleId: null,
        vehicleLabel: null,
        agreedPrice: 100_000 * (i + 1),
      });
    }
    const negotiatingLead = await makeLead("biz_test", customer.id);
    const negotiatingDeal = await dealRepository.createDeal({
      customerId: customer.id,
      leadId: negotiatingLead.id,
      vehicleId: null,
      vehicleLabel: null,
      agreedPrice: 500_000,
    });
    await dealRepository.updateDealStatus(negotiatingDeal.id, "draft", "negotiating");

    const draftOnly = await dealRepository.getDeals({ status: "draft" });
    expect(draftOnly).toHaveLength(3);

    const page = await dealRepository.getDealsPaged({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(4);
    expect(page.totalPages).toBe(2);
  });

  it("scopes every read/write to the constructed businessId — cross-business retrieval returns nothing", async () => {
    const customer = await makeCustomer("biz_test");
    const lead = await makeLead("biz_test", customer.id);
    const deal = await dealRepository.createDeal({
      customerId: customer.id,
      leadId: lead.id,
      vehicleId: null,
      vehicleLabel: null,
      agreedPrice: 900_000,
    });

    expect(await otherBusinessDealRepository.getDealById(deal.id)).toBeNull();
    expect(await otherBusinessDealRepository.updateDeal(deal.id, { notes: "hijacked" })).toBeNull();
    expect(await otherBusinessDealRepository.updateDealStatus(deal.id, "draft", "cancelled")).toBeNull();
    expect(await otherBusinessDealRepository.getDeals()).toHaveLength(0);
  });

  describe("getDealsAwaitingSale — Mission 022", () => {
    it("returns only completed deals with no matching Sale row", async () => {
      const customer = await makeCustomer("biz_test");
      const lead = await makeLead("biz_test", customer.id);
      const awaitingSale = await dealRepository.createDeal({
        customerId: customer.id,
        leadId: lead.id,
        vehicleId: null,
        vehicleLabel: "2020 Mazda Demio",
        agreedPrice: 900_000,
      });
      await dealRepository.updateDealStatus(awaitingSale.id, "draft", "completed");

      const otherLead = await makeLead("biz_test", customer.id);
      const withSale = await dealRepository.createDeal({
        customerId: customer.id,
        leadId: otherLead.id,
        vehicleId: null,
        vehicleLabel: null,
        agreedPrice: 500_000,
      });
      await dealRepository.updateDealStatus(withSale.id, "draft", "completed");
      const now = new Date().toISOString();
      rawDb
        .prepare(
          "INSERT INTO sales (id, business_id, deal_id, customer_id, vehicle_id, vehicle_label, sale_amount, sold_at, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)"
        )
        .run("sale_1", "biz_test", withSale.id, customer.id, 500_000, now, now, now);

      const notCompleted = await dealRepository.createDeal({
        customerId: customer.id,
        leadId: await makeLead("biz_test", customer.id).then((l) => l.id),
        vehicleId: null,
        vehicleLabel: null,
        agreedPrice: 300_000,
      });

      const results = await dealRepository.getDealsAwaitingSale(10);
      expect(results.map((d) => d.id)).toEqual([awaitingSale.id]);
      expect(results.map((d) => d.id)).not.toContain(withSale.id);
      expect(results.map((d) => d.id)).not.toContain(notCompleted.id);
    });

    it("never leaks another business's deals awaiting sale", async () => {
      const otherCustomer = await makeCustomer("biz_other");
      const otherLead = await makeLead("biz_other", otherCustomer.id);
      const otherDeal = await otherBusinessDealRepository.createDeal({
        customerId: otherCustomer.id,
        leadId: otherLead.id,
        vehicleId: null,
        vehicleLabel: null,
        agreedPrice: 400_000,
      });
      await otherBusinessDealRepository.updateDealStatus(otherDeal.id, "draft", "completed");

      const results = await dealRepository.getDealsAwaitingSale(10);
      expect(results).toEqual([]);
    });

    it("respects the limit and orders most-recently-updated first", async () => {
      const customer = await makeCustomer("biz_test");
      const first = await dealRepository.createDeal({
        customerId: customer.id,
        leadId: await makeLead("biz_test", customer.id).then((l) => l.id),
        vehicleId: null,
        vehicleLabel: null,
        agreedPrice: 100_000,
      });
      await dealRepository.updateDealStatus(first.id, "draft", "completed");

      const second = await dealRepository.createDeal({
        customerId: customer.id,
        leadId: await makeLead("biz_test", customer.id).then((l) => l.id),
        vehicleId: null,
        vehicleLabel: null,
        agreedPrice: 200_000,
      });
      await dealRepository.updateDealStatus(second.id, "draft", "completed");

      const limited = await dealRepository.getDealsAwaitingSale(1);
      expect(limited).toHaveLength(1);
      expect(limited[0].id).toBe(second.id);
    });
  });
});

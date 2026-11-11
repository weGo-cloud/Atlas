import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseSaleRepository as SaleRepoClass } from "../database-sale-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../../leads/repository/database-lead-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-sale-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseSaleRepository: typeof SaleRepoClass;
let DuplicateSaleError: new () => Error;
let VehicleAlreadySoldError: new () => Error;
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

  const saleRepoModule = await import("../database-sale-repository");
  DatabaseSaleRepository = saleRepoModule.DatabaseSaleRepository;
  DuplicateSaleError = saleRepoModule.DuplicateSaleError;
  VehicleAlreadySoldError = saleRepoModule.VehicleAlreadySoldError;
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

let dealCounter = 0;
function seedDeal(businessId: string, customerId: string, leadId: string, vehicleId: string | null, status = "completed") {
  dealCounter += 1;
  const id = `deal_test_${dealCounter}`;
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO deals (id, business_id, customer_id, lead_id, vehicle_id, vehicle_label, status, agreed_price, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, '', ?, ?)`
    )
    .run(id, businessId, customerId, leadId, vehicleId, status, 900_000, now, now);
  return { id };
}

async function makeCustomer(businessId: string) {
  return new DatabaseCustomerRepository(businessId).createCustomer({ name: "Test Customer", phone: "0700000000" });
}

async function makeVehicle(businessId: string, stockId: string, status: "available" | "reserved" | "sold" = "sold") {
  return new DatabaseVehicleRepository(businessId).create({
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId,
    mileage: 10000,
    price: 1_000_000,
    status,
    description: "Test vehicle.",
  });
}

async function makeLead(businessId: string, customerId: string, vehicleId?: string) {
  return new DatabaseLeadRepository(businessId).createLead({ customerId, vehicleId: vehicleId ?? null });
}

describe("DatabaseSaleRepository", () => {
  let saleRepository: InstanceType<typeof SaleRepoClass>;
  let otherBusinessSaleRepository: InstanceType<typeof SaleRepoClass>;

  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM sales; DELETE FROM deals; DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
    saleRepository = new DatabaseSaleRepository("biz_test");
    otherBusinessSaleRepository = new DatabaseSaleRepository("biz_other");
  });

  it("creates and retrieves a sale", async () => {
    const customer = await makeCustomer("biz_test");
    const vehicle = await makeVehicle("biz_test", "STK-1");
    const lead = await makeLead("biz_test", customer.id, vehicle.id);
    const deal = seedDeal("biz_test", customer.id, lead.id, vehicle.id);

    const sale = await saleRepository.createSale({
      dealId: deal.id,
      customerId: customer.id,
      vehicleId: vehicle.id,
      vehicleLabel: "2021 Toyota Vitz",
      saleAmount: 950_000,
    });

    expect(sale.saleAmount).toBe(950_000);
    expect(sale.dealId).toBe(deal.id);

    const fetched = await saleRepository.getSaleById(sale.id);
    expect(fetched).toEqual(sale);
  });

  it("enforces the unique index on dealId — a second sale for the same deal is rejected", async () => {
    const customer = await makeCustomer("biz_test");
    const vehicleA = await makeVehicle("biz_test", "STK-2");
    const vehicleB = await makeVehicle("biz_test", "STK-3");
    const lead = await makeLead("biz_test", customer.id, vehicleA.id);
    const deal = seedDeal("biz_test", customer.id, lead.id, vehicleA.id);

    await saleRepository.createSale({
      dealId: deal.id,
      customerId: customer.id,
      vehicleId: vehicleA.id,
      vehicleLabel: "2021 Toyota Vitz",
      saleAmount: 900_000,
    });

    await expect(
      saleRepository.createSale({
        dealId: deal.id,
        customerId: customer.id,
        vehicleId: vehicleB.id,
        vehicleLabel: "2021 Toyota Vitz",
        saleAmount: 900_000,
      })
    ).rejects.toBeInstanceOf(DuplicateSaleError);
  });

  it("enforces the unique index on vehicleId — a second sale for the same vehicle (different deal) is rejected", async () => {
    const customer = await makeCustomer("biz_test");
    const vehicle = await makeVehicle("biz_test", "STK-4");
    const leadA = await makeLead("biz_test", customer.id, vehicle.id);
    const leadB = await makeLead("biz_test", customer.id, vehicle.id);
    const dealA = seedDeal("biz_test", customer.id, leadA.id, vehicle.id);
    const dealB = seedDeal("biz_test", customer.id, leadB.id, vehicle.id);

    await saleRepository.createSale({
      dealId: dealA.id,
      customerId: customer.id,
      vehicleId: vehicle.id,
      vehicleLabel: "2021 Toyota Vitz",
      saleAmount: 900_000,
    });

    await expect(
      saleRepository.createSale({
        dealId: dealB.id,
        customerId: customer.id,
        vehicleId: vehicle.id,
        vehicleLabel: "2021 Toyota Vitz",
        saleAmount: 900_000,
      })
    ).rejects.toBeInstanceOf(VehicleAlreadySoldError);
  });

  it("tolerates multiple sales with a null vehicleId (each vehicle-less sale is historically independent)", async () => {
    const customer = await makeCustomer("biz_test");
    const leadA = await makeLead("biz_test", customer.id);
    const leadB = await makeLead("biz_test", customer.id);
    const dealA = seedDeal("biz_test", customer.id, leadA.id, null);
    const dealB = seedDeal("biz_test", customer.id, leadB.id, null);

    await saleRepository.createSale({
      dealId: dealA.id,
      customerId: customer.id,
      vehicleId: null,
      vehicleLabel: null,
      saleAmount: 500_000,
    });

    await expect(
      saleRepository.createSale({
        dealId: dealB.id,
        customerId: customer.id,
        vehicleId: null,
        vehicleLabel: null,
        saleAmount: 600_000,
      })
    ).resolves.toBeDefined();
  });

  it("getSaleForDeal returns null when the deal has no sale", async () => {
    const customer = await makeCustomer("biz_test");
    const lead = await makeLead("biz_test", customer.id);
    const deal = seedDeal("biz_test", customer.id, lead.id, null);

    expect(await saleRepository.getSaleForDeal(deal.id)).toBeNull();
  });

  it("paginates and filters by customer/vehicle", async () => {
    const customer = await makeCustomer("biz_test");
    for (let i = 0; i < 3; i += 1) {
      const lead = await makeLead("biz_test", customer.id);
      const deal = seedDeal("biz_test", customer.id, lead.id, null);
      await saleRepository.createSale({
        dealId: deal.id,
        customerId: customer.id,
        vehicleId: null,
        vehicleLabel: null,
        saleAmount: 100_000 * (i + 1),
      });
    }

    const page = await saleRepository.getSalesPaged({ page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.totalPages).toBe(2);

    const byCustomer = await saleRepository.getSales({ customerId: customer.id });
    expect(byCustomer).toHaveLength(3);
  });

  it("scopes every read/write to the constructed businessId — cross-business retrieval returns nothing", async () => {
    const customer = await makeCustomer("biz_test");
    const vehicle = await makeVehicle("biz_test", "STK-5");
    const lead = await makeLead("biz_test", customer.id, vehicle.id);
    const deal = seedDeal("biz_test", customer.id, lead.id, vehicle.id);
    const sale = await saleRepository.createSale({
      dealId: deal.id,
      customerId: customer.id,
      vehicleId: vehicle.id,
      vehicleLabel: "2021 Toyota Vitz",
      saleAmount: 900_000,
    });

    expect(await otherBusinessSaleRepository.getSaleById(sale.id)).toBeNull();
    expect(await otherBusinessSaleRepository.getSales()).toHaveLength(0);
    expect(await otherBusinessSaleRepository.getSaleForDeal(deal.id)).toBeNull();
  });
});

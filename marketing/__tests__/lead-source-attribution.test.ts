import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { LeadService as LeadServiceClass } from "../../leads/service/lead-service";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../leads/repository/database-lead-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../customers/repository/database-customer-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../inventory/repository/database-vehicle-repository";
import type { DatabaseFurnitureProductRepository as FurnitureRepoClass } from "../../furniture/repository/database-furniture-product-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-marketing-lead-attribution-db-"));
const testDbPath = path.join(testDir, "test.db");

let LeadService: typeof LeadServiceClass;
let DatabaseLeadRepository: typeof LeadRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
let DatabaseFurnitureProductRepository: typeof FurnitureRepoClass;
let rawDb: Database.Database;

const BUSINESS_ID = "biz_marketing_lead_attribution";

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
    .prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, 'auto', ?, ?)")
    .run(BUSINESS_ID, "Test Business", now, now);
  setupDb
    .prepare(
      `INSERT INTO vehicles (id, business_id, make, model, year, stock_id, mileage, price, status, description, added_at, updated_at)
       VALUES ('veh_attr_1', ?, 'Toyota', 'Vitz', 2021, 'veh_attr_1', 45000, 1800000, 'available', '', ?, ?)`
    )
    .run(BUSINESS_ID, now, now);
  setupDb
    .prepare(
      `INSERT INTO furniture_products (id, business_id, name, description, category, price, currency, condition, status, added_at, updated_at)
       VALUES ('furn_attr_1', ?, 'Sofa', '', 'sofas', 50000, 'KES', 'new', 'available', ?, ?)`
    )
    .run(BUSINESS_ID, now, now);
  setupDb.close();

  LeadService = (await import("../../leads/service/lead-service")).LeadService;
  DatabaseLeadRepository = (await import("../../leads/repository/database-lead-repository")).DatabaseLeadRepository;
  DatabaseCustomerRepository = (await import("../../customers/repository/database-customer-repository")).DatabaseCustomerRepository;
  DatabaseVehicleRepository = (await import("../../inventory/repository/database-vehicle-repository")).DatabaseVehicleRepository;
  DatabaseFurnitureProductRepository = (await import("../../furniture/repository/database-furniture-product-repository"))
    .DatabaseFurnitureProductRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec("DELETE FROM leads; DELETE FROM customers;");
});

function getLeadService() {
  return new LeadService(
    new DatabaseLeadRepository(BUSINESS_ID),
    new DatabaseCustomerRepository(BUSINESS_ID),
    new DatabaseVehicleRepository(BUSINESS_ID),
    new DatabaseFurnitureProductRepository(BUSINESS_ID)
  );
}

/** Mission 031, Section 10/11 — "identify the source where possible: website, WhatsApp, Facebook, Instagram, Meta." Leads.source is free text (no migration needed — Mission 011's schema already supports any string), so this proves the channel values flow through correctly end-to-end. */
describe("Channel-source lead attribution", () => {
  it("records source='whatsapp' with the vehicle association", async () => {
    const customerService = new DatabaseCustomerRepository(BUSINESS_ID);
    const customer = await customerService.createCustomer({ name: "Jane", phone: "0700000001" });

    const result = await getLeadService().createLead({
      customerId: customer.id,
      vehicleId: "veh_attr_1",
      source: "whatsapp",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("whatsapp");
    expect(result.data.vehicleId).toBe("veh_attr_1");
    expect(result.data.businessId).toBe(BUSINESS_ID);
  });

  it("records source='meta' with the furniture product association", async () => {
    const customerService = new DatabaseCustomerRepository(BUSINESS_ID);
    const customer = await customerService.createCustomer({ name: "John", phone: "0700000002" });

    const result = await getLeadService().createLead({
      customerId: customer.id,
      furnitureProductId: "furn_attr_1",
      source: "meta",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("meta");
    expect(result.data.furnitureProductId).toBe("furn_attr_1");
    expect(result.data.furnitureProductLabel).toBe("Sofa");
  });

  it("a dealer answering 'which channel generated this lead' can read it straight off the lead", async () => {
    const customerService = new DatabaseCustomerRepository(BUSINESS_ID);
    const customerA = await customerService.createCustomer({ name: "A", phone: "0700000003" });
    const customerB = await customerService.createCustomer({ name: "B", phone: "0700000004" });

    await getLeadService().createLead({ customerId: customerA.id, vehicleId: "veh_attr_1", source: "storefront" });
    await getLeadService().createLead({ customerId: customerB.id, vehicleId: "veh_attr_1", source: "whatsapp" });

    const leads = await getLeadService().getLeadsForVehicle("veh_attr_1");
    const sources = leads.map((lead) => lead.source).sort();
    expect(sources).toEqual(["storefront", "whatsapp"]);
  });
});

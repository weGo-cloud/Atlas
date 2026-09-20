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
import type { DatabaseFurnitureProductRepository as FurnitureRepoClass } from "../repository/database-furniture-product-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-furniture-leads-db-"));
const testDbPath = path.join(testDir, "test.db");

let LeadService: typeof LeadServiceClass;
let DatabaseLeadRepository: typeof LeadRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
let DatabaseFurnitureProductRepository: typeof FurnitureRepoClass;
let rawDb: Database.Database;

const BUSINESS_A = "biz_furniture_leads_a";
const BUSINESS_B = "biz_furniture_leads_b";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  for (const id of [BUSINESS_A, BUSINESS_B]) {
    setupDb
      .prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, 'furniture', ?, ?)")
      .run(id, `Business ${id}`, now, now);
  }
  setupDb.close();

  LeadService = (await import("../../leads/service/lead-service")).LeadService;
  DatabaseLeadRepository = (await import("../../leads/repository/database-lead-repository")).DatabaseLeadRepository;
  DatabaseCustomerRepository = (await import("../../customers/repository/database-customer-repository")).DatabaseCustomerRepository;
  DatabaseVehicleRepository = (await import("../../inventory/repository/database-vehicle-repository")).DatabaseVehicleRepository;
  DatabaseFurnitureProductRepository = (await import("../repository/database-furniture-product-repository")).DatabaseFurnitureProductRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec("DELETE FROM leads; DELETE FROM customers; DELETE FROM furniture_products;");
});

function makeService(businessId: string) {
  return new LeadService(
    new DatabaseLeadRepository(businessId),
    new DatabaseCustomerRepository(businessId),
    new DatabaseVehicleRepository(businessId),
    new DatabaseFurnitureProductRepository(businessId)
  );
}

async function makeProduct(businessId: string, name = "Test Sofa") {
  return new DatabaseFurnitureProductRepository(businessId).create({
    name,
    description: "",
    category: "sofas",
    price: 1000,
    currency: "KES",
    condition: "new",
    status: "available",
    material: null,
    color: null,
    dimensions: null,
    sku: null,
  });
}

/** Mission 030, Section 13/22 — "furniture enquiry creates/updates the correct lead". */
describe("LeadService — furniture product association", () => {
  it("creates a lead with the furniture product reference and a name snapshot", async () => {
    const leadService = makeService(BUSINESS_A);
    const customerRepo = new DatabaseCustomerRepository(BUSINESS_A);
    const customer = await customerRepo.createCustomer({ name: "Jane", phone: "0700000000" });
    const product = await makeProduct(BUSINESS_A, "Nairobi 3-Seater Sofa");

    const result = await leadService.createLead({
      customerId: customer.id,
      furnitureProductId: product.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.furnitureProductId).toBe(product.id);
    expect(result.data.furnitureProductLabel).toBe("Nairobi 3-Seater Sofa");
    expect(result.data.vehicleId).toBeNull(); // the vehicle pair stays untouched for a furniture-vertical lead
  });

  it("fails with FURNITURE_PRODUCT_NOT_FOUND for a nonexistent product id", async () => {
    const leadService = makeService(BUSINESS_A);
    const customerRepo = new DatabaseCustomerRepository(BUSINESS_A);
    const customer = await customerRepo.createCustomer({ name: "Jane", phone: "0700000000" });

    const result = await leadService.createLead({ customerId: customer.id, furnitureProductId: "does-not-exist" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FURNITURE_PRODUCT_NOT_FOUND");
  });

  it("getLeadsForFurnitureProduct returns leads for that product only", async () => {
    const leadService = makeService(BUSINESS_A);
    const customerRepo = new DatabaseCustomerRepository(BUSINESS_A);
    const customerA = await customerRepo.createCustomer({ name: "Jane", phone: "0700000001" });
    const customerB = await customerRepo.createCustomer({ name: "John", phone: "0700000002" });
    const productA = await makeProduct(BUSINESS_A, "Sofa A");
    const productB = await makeProduct(BUSINESS_A, "Sofa B");

    await leadService.createLead({ customerId: customerA.id, furnitureProductId: productA.id });
    await leadService.createLead({ customerId: customerB.id, furnitureProductId: productB.id });

    const leadsForA = await leadService.getLeadsForFurnitureProduct(productA.id);
    expect(leadsForA).toHaveLength(1);
    expect(leadsForA[0].customerId).toBe(customerA.id);
  });

  it("still works with only a customer (general enquiry, no product selected)", async () => {
    const leadService = makeService(BUSINESS_A);
    const customerRepo = new DatabaseCustomerRepository(BUSINESS_A);
    const customer = await customerRepo.createCustomer({ name: "Jane", phone: "0700000000" });

    const result = await leadService.createLead({ customerId: customer.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.furnitureProductId).toBeNull();
  });
});

/** Mission 030, Section 18 — cross-tenant leakage must be impossible, not just filtered client-side. */
describe("Cross-business furniture lead isolation (critical)", () => {
  it("business B cannot create a lead referencing business A's furniture product", async () => {
    const productA = await makeProduct(BUSINESS_A, "A's Sofa");

    const leadServiceB = makeService(BUSINESS_B);
    const customerRepoB = new DatabaseCustomerRepository(BUSINESS_B);
    const customerB = await customerRepoB.createCustomer({ name: "Bob", phone: "0700000003" });

    const result = await leadServiceB.createLead({ customerId: customerB.id, furnitureProductId: productA.id });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FURNITURE_PRODUCT_NOT_FOUND");
  });

  it("business B's getLeadsForFurnitureProduct never returns business A's leads, even for the same product id coincidentally reused", async () => {
    const productA = await makeProduct(BUSINESS_A, "A's Sofa");
    const customerRepoA = new DatabaseCustomerRepository(BUSINESS_A);
    const customerA = await customerRepoA.createCustomer({ name: "Alice", phone: "0700000004" });
    await makeService(BUSINESS_A).createLead({ customerId: customerA.id, furnitureProductId: productA.id });

    const leadsForB = await makeService(BUSINESS_B).getLeadsForFurnitureProduct(productA.id);
    expect(leadsForB).toHaveLength(0);
  });
});

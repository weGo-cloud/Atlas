import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseLeadRepository as LeadRepoClass } from "../database-lead-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";
import type { LeadService as LeadServiceClass } from "../../service/lead-service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-lead-isolation-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseLeadRepository: typeof LeadRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
let LeadService: typeof LeadServiceClass;
let rawDb: Database.Database;

const BUSINESS_A = "biz_lead_isolation_a";
const BUSINESS_B = "biz_lead_isolation_b";

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

  const leadRepoModule = await import("../database-lead-repository");
  const customerRepoModule = await import("../../../customers/repository/database-customer-repository");
  const vehicleRepoModule = await import("../../../inventory/repository/database-vehicle-repository");
  const leadServiceModule = await import("../../service/lead-service");
  DatabaseLeadRepository = leadRepoModule.DatabaseLeadRepository;
  DatabaseCustomerRepository = customerRepoModule.DatabaseCustomerRepository;
  DatabaseVehicleRepository = vehicleRepoModule.DatabaseVehicleRepository;
  LeadService = leadServiceModule.LeadService;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

function scopedFor(businessId: string) {
  const leadRepo = new DatabaseLeadRepository(businessId);
  const customerRepo = new DatabaseCustomerRepository(businessId);
  const vehicleRepo = new DatabaseVehicleRepository(businessId);
  const leadService = new LeadService(leadRepo, customerRepo, vehicleRepo);
  return { leadRepo, customerRepo, vehicleRepo, leadService };
}

async function makeVehicle(repo: InstanceType<typeof VehicleRepoClass>, stockId: string) {
  return repo.create({
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId,
    mileage: 10000,
    price: 1000000,
    status: "available",
    description: "Isolation test vehicle.",
  });
}

describe("Cross-business lead isolation (Mission 012, Phase 7 — critical)", () => {
  let a: ReturnType<typeof scopedFor>;
  let b: ReturnType<typeof scopedFor>;

  beforeEach(() => {
    rawDb.exec(
      "DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;"
    );
    a = scopedFor(BUSINESS_A);
    b = scopedFor(BUSINESS_B);
  });

  it("business B cannot read business A's lead by id", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000001" });
    const leadA = await a.leadRepo.createLead({ customerId: customerA.id });

    const found = await b.leadRepo.getLeadById(leadA.id);
    expect(found).toBeNull();
  });

  it("business B's getLeads() never includes business A's leads", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000002" });
    await a.leadRepo.createLead({ customerId: customerA.id });
    const customerB = await b.customerRepo.createCustomer({ name: "John B", phone: "0700000003" });
    await b.leadRepo.createLead({ customerId: customerB.id });

    const resultB = await b.leadRepo.getLeads();
    expect(resultB).toHaveLength(1);
    expect(resultB[0].customerId).toBe(customerB.id);
  });

  it("business B cannot update business A's lead status by manipulating the id", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000004" });
    const leadA = await a.leadRepo.createLead({ customerId: customerA.id });

    const updated = await b.leadRepo.updateLeadStatus(leadA.id, "contacted");
    expect(updated).toBeNull();

    const stillA = await a.leadRepo.getLeadById(leadA.id);
    expect(stillA?.status).toBe("new");
  });

  it("EMERGENT PROPERTY: LeadService.createLead rejects a lead against another business's customer, with zero isolation-specific code in LeadService itself", async () => {
    // This is the core architectural bet of Mission 012's design: a
    // business-scoped LeadService gets cross-business isolation for
    // free through its *existing* Mission 010 "customer must exist"
    // check, because a business-scoped customerRepository.getCustomerById
    // simply can't see another business's customer.
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000005" });

    // Business B's LeadService tries to create a lead against
    // business A's real, valid customer id.
    const result = await b.leadService.createLead({ customerId: customerA.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("EMERGENT PROPERTY: LeadService.createLead rejects a lead against another business's vehicle", async () => {
    const customerB = await b.customerRepo.createCustomer({ name: "John B", phone: "0700000006" });
    const vehicleA = await makeVehicle(a.vehicleRepo, "ISO-LEAD-A-0001");

    const result = await b.leadService.createLead({
      customerId: customerB.id,
      vehicleId: vehicleA.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
  });

  it("business B's getLeadsForVehicle cannot see business A's leads even by passing A's real vehicle id", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000007" });
    const vehicleA = await makeVehicle(a.vehicleRepo, "ISO-LEAD-A-0002");
    await a.leadRepo.createLead({ customerId: customerA.id, vehicleId: vehicleA.id });

    const result = await b.leadRepo.getLeadsForVehicle(vehicleA.id);
    expect(result).toEqual([]);
  });

  it("countByStatus and countLeadsByVehicle are scoped per business", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000008" });
    const vehicleA = await makeVehicle(a.vehicleRepo, "ISO-LEAD-A-0003");
    await a.leadRepo.createLead({ customerId: customerA.id, vehicleId: vehicleA.id, status: "new" });
    await a.leadRepo.createLead({ customerId: customerA.id, vehicleId: vehicleA.id, status: "new" });

    const customerB = await b.customerRepo.createCustomer({ name: "John B", phone: "0700000009" });
    await b.leadRepo.createLead({ customerId: customerB.id, status: "new" });

    const countsA = await a.leadRepo.countByStatus();
    const countsB = await b.leadRepo.countByStatus();
    expect(countsA.new).toBe(2);
    expect(countsB.new).toBe(1);

    const rankedA = await a.leadRepo.countLeadsByVehicle(5);
    expect(rankedA).toEqual([{ vehicleId: vehicleA.id, count: 2 }]);
  });

  it("business B's getLeadsPaged() never includes business A's leads (Mission 015)", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000011" });
    await a.leadRepo.createLead({ customerId: customerA.id });
    const customerB = await b.customerRepo.createCustomer({ name: "John B", phone: "0700000012" });
    await b.leadRepo.createLead({ customerId: customerB.id });

    const resultB = await b.leadRepo.getLeadsPaged({ page: 1, pageSize: 10 });
    expect(resultB.total).toBe(1);
    expect(resultB.items[0].customerId).toBe(customerB.id);
  });

  it("a business B session cannot use business A's customerId as a lifecycle/followUp filter to see A's leads", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000013" });
    await a.leadRepo.createLead({ customerId: customerA.id, nextFollowUpAt: "2020-01-01" });

    // Business B's own repository is constructed with businessId "B" —
    // filtering by A's customerId (an IDOR attempt) still can't surface
    // A's row, because the WHERE clause always ANDs in ownedByBusiness.
    const result = await b.leadRepo.getLeadsPaged({
      customerId: customerA.id,
      followUpDueBy: "2026-01-01",
      page: 1,
      pageSize: 10,
    });
    expect(result.total).toBe(0);
  });

  it("a business B LeadService cannot update a business A lead's follow-up/notes via updateLead", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000014" });
    const leadA = await a.leadRepo.createLead({ customerId: customerA.id });

    const result = await b.leadService.updateLead(leadA.id, { notes: "tampered" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");

    const stillA = await a.leadRepo.getLeadById(leadA.id);
    expect(stillA?.notes).not.toBe("tampered");
  });

  it("a freshly created lead is always stamped with the constructing repository's businessId", async () => {
    const customerA = await a.customerRepo.createCustomer({ name: "Jane A", phone: "0700000010" });
    const leadA = await a.leadRepo.createLead({ customerId: customerA.id });
    expect(leadA.businessId).toBe(BUSINESS_A);
  });
});

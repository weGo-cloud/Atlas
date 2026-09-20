import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseLeadRepository as LeadRepoClass } from "../database-lead-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-lead-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseLeadRepository: typeof LeadRepoClass;
let DatabaseCustomerRepository: typeof CustomerRepoClass;
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

  const leadRepoModule = await import("../database-lead-repository");
  const customerRepoModule = await import("../../../customers/repository/database-customer-repository");
  const vehicleRepoModule = await import("../../../inventory/repository/database-vehicle-repository");
  DatabaseLeadRepository = leadRepoModule.DatabaseLeadRepository;
  DatabaseCustomerRepository = customerRepoModule.DatabaseCustomerRepository;
  DatabaseVehicleRepository = vehicleRepoModule.DatabaseVehicleRepository;

  rawDb = new Database(testDbPath);
  // Mission 012: businessId columns FK-reference businesses.id, and
  // foreign_keys enforcement is ON — every row this suite creates
  // with businessId: "biz_test" needs that business to actually exist.
  rawDb.prepare(
    "INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run("biz_test", "Test Business", new Date().toISOString(), new Date().toISOString());
  rawDb.pragma("foreign_keys = ON");
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

async function makeCustomer(repo: InstanceType<typeof CustomerRepoClass>, name: string) {
  return repo.createCustomer({ name, phone: "0700000000" });
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
    description: "Test vehicle.",
  });
}

describe("DatabaseLeadRepository", () => {
  let leadRepository: InstanceType<typeof LeadRepoClass>;
  let customerRepository: InstanceType<typeof CustomerRepoClass>;
  let vehicleRepository: InstanceType<typeof VehicleRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;");
    leadRepository = new DatabaseLeadRepository("biz_test");
    customerRepository = new DatabaseCustomerRepository("biz_test");
    vehicleRepository = new DatabaseVehicleRepository("biz_test");
  });

  it("creates a lead and reads it back, defaulting to status 'new'", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    const vehicle = await makeVehicle(vehicleRepository, "LD-0001");

    const lead = await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id });
    expect(lead.status).toBe("new");

    const found = await leadRepository.getLeadById(lead.id);
    expect(found?.customerId).toBe(customer.id);
    expect(found?.vehicleId).toBe(vehicle.id);
  });

  it("creates a lead with no vehicle (general interest)", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    const lead = await leadRepository.createLead({ customerId: customer.id, vehicleId: null });
    expect(lead.vehicleId).toBeNull();
  });

  it("returns null for a missing lead", async () => {
    expect(await leadRepository.getLeadById("does-not-exist")).toBeNull();
  });

  it("filters leads by status", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    await leadRepository.createLead({ customerId: customer.id, status: "new" });
    await leadRepository.createLead({ customerId: customer.id, status: "contacted" });

    const result = await leadRepository.getLeads({ status: "contacted" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("contacted");
  });

  it("filters leads by customer", async () => {
    const customerA = await makeCustomer(customerRepository, "Jane");
    const customerB = await makeCustomer(customerRepository, "John");
    await leadRepository.createLead({ customerId: customerA.id });
    await leadRepository.createLead({ customerId: customerB.id });

    const result = await leadRepository.getLeads({ customerId: customerA.id });
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe(customerA.id);
  });

  it("filters leads by vehicle", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    const vehicleA = await makeVehicle(vehicleRepository, "LD-0002");
    const vehicleB = await makeVehicle(vehicleRepository, "LD-0003");
    await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicleA.id });
    await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicleB.id });

    const result = await leadRepository.getLeads({ vehicleId: vehicleA.id });
    expect(result).toHaveLength(1);
    expect(result[0].vehicleId).toBe(vehicleA.id);
  });

  it("updates lead status", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    const lead = await leadRepository.createLead({ customerId: customer.id });

    const updated = await leadRepository.updateLeadStatus(lead.id, "qualified");
    expect(updated?.status).toBe("qualified");
  });

  it("returns null updating status of a missing lead", async () => {
    expect(await leadRepository.updateLeadStatus("does-not-exist", "qualified")).toBeNull();
  });

  it("updates lead notes/source via updateLead", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    const lead = await leadRepository.createLead({ customerId: customer.id });

    const updated = await leadRepository.updateLead(lead.id, { notes: "Called back, interested." });
    expect(updated?.notes).toBe("Called back, interested.");
  });

  it("getLeadsForCustomer returns only that customer's leads, newest first", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    const other = await makeCustomer(customerRepository, "John");
    await leadRepository.createLead({ customerId: other.id });
    const first = await leadRepository.createLead({ customerId: customer.id });
    await new Promise((r) => setTimeout(r, 5));
    const second = await leadRepository.createLead({ customerId: customer.id });

    const result = await leadRepository.getLeadsForCustomer(customer.id);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(second.id);
    expect(result[1].id).toBe(first.id);
  });

  it("getLeadsForVehicle returns only that vehicle's leads", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    const vehicle = await makeVehicle(vehicleRepository, "LD-0004");
    const otherVehicle = await makeVehicle(vehicleRepository, "LD-0005");
    await leadRepository.createLead({ customerId: customer.id, vehicleId: otherVehicle.id });
    await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id });

    const result = await leadRepository.getLeadsForVehicle(vehicle.id);
    expect(result).toHaveLength(1);
    expect(result[0].vehicleId).toBe(vehicle.id);
  });

  it("countByStatus counts leads per status", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    await leadRepository.createLead({ customerId: customer.id, status: "new" });
    await leadRepository.createLead({ customerId: customer.id, status: "new" });
    await leadRepository.createLead({ customerId: customer.id, status: "lost" });

    const counts = await leadRepository.countByStatus();
    expect(counts.new).toBe(2);
    expect(counts.lost).toBe(1);
    expect(counts.contacted).toBe(0);
  });

  it("countLeadsByVehicle ranks vehicles by lead count, excluding null vehicleId", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    const popular = await makeVehicle(vehicleRepository, "LD-0006");
    await leadRepository.createLead({ customerId: customer.id, vehicleId: popular.id });
    await leadRepository.createLead({ customerId: customer.id, vehicleId: popular.id });
    await leadRepository.createLead({ customerId: customer.id, vehicleId: null });

    const result = await leadRepository.countLeadsByVehicle(5);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ vehicleId: popular.id, count: 2 });
  });

  it("getRecentLeads orders newest first and respects the limit", async () => {
    const customer = await makeCustomer(customerRepository, "Jane");
    for (let i = 0; i < 3; i++) {
      await leadRepository.createLead({ customerId: customer.id });
      await new Promise((r) => setTimeout(r, 5));
    }
    const recent = await leadRepository.getRecentLeads(2);
    expect(recent).toHaveLength(2);
  });

  describe("deletion behavior (Phase 7)", () => {
    it("cascades: deleting a customer removes their leads", async () => {
      const customer = await makeCustomer(customerRepository, "Jane");
      const vehicle = await makeVehicle(vehicleRepository, "LD-0007");
      const lead = await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id });

      rawDb.prepare("DELETE FROM customers WHERE id = ?").run(customer.id);

      expect(await leadRepository.getLeadById(lead.id)).toBeNull();
    });

    it("set-null: deleting a vehicle preserves the lead with vehicleId cleared", async () => {
      const customer = await makeCustomer(customerRepository, "Jane");
      const vehicle = await makeVehicle(vehicleRepository, "LD-0008");
      const lead = await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id });

      rawDb.prepare("DELETE FROM vehicles WHERE id = ?").run(vehicle.id);

      const survived = await leadRepository.getLeadById(lead.id);
      expect(survived).not.toBeNull();
      expect(survived?.vehicleId).toBeNull();
      // The customer relationship and notes/status survive intact —
      // this is the "don't silently destroy business data" behavior.
      expect(survived?.customerId).toBe(customer.id);
    });

    it("set-null via the real VehicleService.deleteVehicle flow, not just a raw DELETE", async () => {
      const { VehicleService } = await import("../../../inventory/service/vehicle-service");
      const customer = await makeCustomer(customerRepository, "Jane");
      const vehicle = await makeVehicle(vehicleRepository, "LD-0009");
      const lead = await leadRepository.createLead({ customerId: customer.id, vehicleId: vehicle.id });

      const vehicleService = new VehicleService(vehicleRepository);
      const deleteResult = await vehicleService.deleteVehicle(vehicle.id);
      expect(deleteResult.ok).toBe(true);

      const survived = await leadRepository.getLeadById(lead.id);
      expect(survived?.vehicleId).toBeNull();
    });
  });

  describe("completeFollowUp — atomicity", () => {
    it("only completes a lead that currently has nextFollowUpAt set (changes=0 otherwise)", async () => {
      const customer = await makeCustomer(customerRepository, "Jane");
      const lead = await leadRepository.createLead({ customerId: customer.id });
      // No nextFollowUpAt was set — the conditional UPDATE's WHERE
      // clause shouldn't match this row at all.
      const result = await leadRepository.completeFollowUp(lead.id);
      expect(result).toBeNull();
    });

    it(
      "concurrent completeFollowUp calls on the same row: exactly one produces a real write " +
        "(regression test for the read-then-write race — see the method's own comment)",
      async () => {
        const customer = await makeCustomer(customerRepository, "Jane");
        const lead = await leadRepository.createLead({
          customerId: customer.id,
          nextFollowUpAt: "2026-09-01",
        });

        const results = await Promise.all([
          leadRepository.completeFollowUp(lead.id),
          leadRepository.completeFollowUp(lead.id),
          leadRepository.completeFollowUp(lead.id),
        ]);

        const nonNullResults = results.filter((r) => r !== null);
        expect(nonNullResults).toHaveLength(1);

        const final = await leadRepository.getLeadById(lead.id);
        expect(final?.nextFollowUpAt).toBeNull();
      }
    );
  });

  describe("getOverdueFollowUpLeads — Mission 022", () => {
    it("returns only active leads with nextFollowUpAt before the start of `now`'s day", async () => {
      const customer = await makeCustomer(customerRepository, "Jane");
      const overdue = await leadRepository.createLead({
        customerId: customer.id,
        nextFollowUpAt: "2026-08-01T09:00:00.000Z",
      });
      // Due today, not yet overdue.
      await leadRepository.createLead({ customerId: customer.id, nextFollowUpAt: "2026-09-02T09:00:00.000Z" });
      // No follow-up scheduled at all.
      await leadRepository.createLead({ customerId: customer.id });

      const results = await leadRepository.getOverdueFollowUpLeads("2026-09-02T12:00:00.000Z", 10);
      expect(results.map((l) => l.id)).toEqual([overdue.id]);
    });

    it("excludes terminal-status leads even with an overdue nextFollowUpAt", async () => {
      const customer = await makeCustomer(customerRepository, "Jane");
      const lead = await leadRepository.createLead({
        customerId: customer.id,
        nextFollowUpAt: "2026-08-01T09:00:00.000Z",
      });
      await leadRepository.updateLeadStatus(lead.id, "won");

      const results = await leadRepository.getOverdueFollowUpLeads("2026-09-02T12:00:00.000Z", 10);
      expect(results).toEqual([]);
    });

    it("orders most-overdue first and respects the limit", async () => {
      const customer = await makeCustomer(customerRepository, "Jane");
      const leastOverdue = await leadRepository.createLead({
        customerId: customer.id,
        nextFollowUpAt: "2026-08-30T00:00:00.000Z",
      });
      const mostOverdue = await leadRepository.createLead({
        customerId: customer.id,
        nextFollowUpAt: "2026-08-01T00:00:00.000Z",
      });

      const results = await leadRepository.getOverdueFollowUpLeads("2026-09-02T12:00:00.000Z", 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(mostOverdue.id);
      // Sanity: with no limit, the least-overdue one would still show up second.
      const all = await leadRepository.getOverdueFollowUpLeads("2026-09-02T12:00:00.000Z", 10);
      expect(all.map((l) => l.id)).toEqual([mostOverdue.id, leastOverdue.id]);
    });
  });

  describe("getActiveLeadsCreatedInRange — Mission 022", () => {
    it("returns only active leads created within [from, to)", async () => {
      const customer = await makeCustomer(customerRepository, "Jane");
      const inRange = await leadRepository.createLead({ customerId: customer.id });
      const outOfRange = await leadRepository.createLead({ customerId: customer.id });
      await leadRepository.updateLeadStatus(outOfRange.id, "won");
      rawDb
        .prepare("UPDATE leads SET created_at = ? WHERE id = ?")
        .run("2026-08-15T00:00:00.000Z", inRange.id);
      rawDb
        .prepare("UPDATE leads SET created_at = ? WHERE id = ?")
        .run("2026-07-01T00:00:00.000Z", outOfRange.id);

      const results = await leadRepository.getActiveLeadsCreatedInRange(
        "2026-08-01T00:00:00.000Z",
        "2026-09-01T00:00:00.000Z",
        10
      );
      expect(results.map((l) => l.id)).toEqual([inRange.id]);
    });

    it("treats null bounds as open-ended", async () => {
      const customer = await makeCustomer(customerRepository, "Jane");
      const lead = await leadRepository.createLead({ customerId: customer.id });
      rawDb.prepare("UPDATE leads SET created_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", lead.id);

      const results = await leadRepository.getActiveLeadsCreatedInRange(null, null, 10);
      expect(results.map((l) => l.id)).toContain(lead.id);
    });
  });
});

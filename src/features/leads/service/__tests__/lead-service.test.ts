import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { LeadService as LeadServiceClass } from "../lead-service";
import type { DatabaseLeadRepository as LeadRepoClass } from "../../repository/database-lead-repository";
import type { DatabaseCustomerRepository as CustomerRepoClass } from "../../../customers/repository/database-customer-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../../inventory/repository/database-vehicle-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-lead-service-db-"));
const testDbPath = path.join(testDir, "test.db");

let LeadService: typeof LeadServiceClass;
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

  const serviceModule = await import("../lead-service");
  const leadRepoModule = await import("../../repository/database-lead-repository");
  const customerRepoModule = await import("../../../customers/repository/database-customer-repository");
  const vehicleRepoModule = await import("../../../inventory/repository/database-vehicle-repository");
  LeadService = serviceModule.LeadService;
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
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

async function makeCustomer(repo: InstanceType<typeof CustomerRepoClass>, name = "Jane") {
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

describe("LeadService", () => {
  let service: InstanceType<typeof LeadServiceClass>;
  let customerRepository: InstanceType<typeof CustomerRepoClass>;
  let vehicleRepository: InstanceType<typeof VehicleRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM customers; DELETE FROM vehicles;");
    customerRepository = new DatabaseCustomerRepository("biz_test");
    vehicleRepository = new DatabaseVehicleRepository("biz_test");
    service = new LeadService(new DatabaseLeadRepository("biz_test"), customerRepository, vehicleRepository);
  });

  describe("createLead", () => {
    it("creates a lead when the customer exists and no vehicle is given", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createLead({ customerId: customer.id });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe("new");
    });

    it("creates a lead when both customer and vehicle exist", async () => {
      const customer = await makeCustomer(customerRepository);
      const vehicle = await makeVehicle(vehicleRepository, "SV-0001");
      const result = await service.createLead({ customerId: customer.id, vehicleId: vehicle.id });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.vehicleId).toBe(vehicle.id);
    });

    it("rejects a missing customer", async () => {
      const result = await service.createLead({ customerId: "does-not-exist" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
    });

    it("rejects a missing vehicle", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createLead({ customerId: customer.id, vehicleId: "does-not-exist" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
    });

    it("rejects an empty customerId", async () => {
      const result = await service.createLead({ customerId: "" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("getLead", () => {
    it("retrieves an existing lead", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.getLead(created.data.id);
      expect(result.ok).toBe(true);
    });

    it("returns NOT_FOUND for a missing lead", async () => {
      const result = await service.getLead("does-not-exist");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });
  });

  describe("updateLeadStatus", () => {
    it("allows a valid transition", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.updateLeadStatus(created.data.id, "contacted");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe("contacted");
    });

    it("allows correcting a 'lost' lead back to 'new' (no irreversible assumptions)", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      await service.updateLeadStatus(created.data.id, "lost");
      const result = await service.updateLeadStatus(created.data.id, "new");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe("new");
    });

    it("allows reopening a 'won' lead", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      await service.updateLeadStatus(created.data.id, "won");
      const result = await service.updateLeadStatus(created.data.id, "contacted");
      expect(result.ok).toBe(true);
    });

    it("allows a walk-in to jump straight from 'new' to 'won'", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.updateLeadStatus(created.data.id, "won");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe("won");
    });

    it("allows moving through 'negotiating'", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      await service.updateLeadStatus(created.data.id, "qualified");
      const result = await service.updateLeadStatus(created.data.id, "negotiating");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.status).toBe("negotiating");
    });

    it("rejects a direct 'won' -> 'lost' transition (Mission 015 — must reopen first)", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      await service.updateLeadStatus(created.data.id, "won");
      const result = await service.updateLeadStatus(created.data.id, "lost");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_STATUS_TRANSITION");

      const stillWon = await service.getLead(created.data.id);
      expect(stillWon.ok).toBe(true);
      if (stillWon.ok) expect(stillWon.data.status).toBe("won");
    });

    it("rejects a direct 'lost' -> 'won' transition the same way", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      await service.updateLeadStatus(created.data.id, "lost");
      const result = await service.updateLeadStatus(created.data.id, "won");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("allows won -> lost after reopening through an active status", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      await service.updateLeadStatus(created.data.id, "won");
      await service.updateLeadStatus(created.data.id, "contacted");
      const result = await service.updateLeadStatus(created.data.id, "lost");
      expect(result.ok).toBe(true);
    });

    it("rejects a no-op transition to the same status", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.updateLeadStatus(created.data.id, "new");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("returns NOT_FOUND for a missing lead", async () => {
      const result = await service.updateLeadStatus("does-not-exist", "contacted");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    it("stamps lastContactedAt on every successful transition (Mission 015)", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");
      expect(created.data.lastContactedAt).toBeNull();

      const result = await service.updateLeadStatus(created.data.id, "contacted");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.lastContactedAt).not.toBeNull();
    });

    it("does not stamp lastContactedAt on a rejected transition", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      await service.updateLeadStatus(created.data.id, "new"); // no-op, rejected
      const after = await service.getLead(created.data.id);
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.data.lastContactedAt).toBeNull();
    });
  });

  describe("nextFollowUpAt (Mission 015)", () => {
    it("can be set at creation", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createLead({ customerId: customer.id, nextFollowUpAt: "2026-09-01" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.nextFollowUpAt).toBe("2026-09-01");
    });

    it("can be set and cleared via update", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      const updated = await service.updateLead(created.data.id, { nextFollowUpAt: "2026-10-15" });
      expect(updated.ok).toBe(true);
      if (updated.ok) expect(updated.data.nextFollowUpAt).toBe("2026-10-15");

      const cleared = await service.updateLead(created.data.id, { nextFollowUpAt: null });
      expect(cleared.ok).toBe(true);
      if (cleared.ok) expect(cleared.data.nextFollowUpAt).toBeNull();
    });
  });

  describe("completeFollowUp", () => {
    it("completes a scheduled follow-up, clearing nextFollowUpAt and stamping lastContactedAt", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id, nextFollowUpAt: "2026-09-01" });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.completeFollowUp(created.data.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.nextFollowUpAt).toBeNull();
        expect(result.data.lastContactedAt).not.toBeNull();
      }
    });

    it("rejects completion when nothing is scheduled", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      const result = await service.completeFollowUp(created.data.id);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NO_SCHEDULED_FOLLOW_UP");
    });

    it("rejects a second, sequential completion attempt", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id, nextFollowUpAt: "2026-09-01" });
      if (!created.ok) throw new Error("setup failed");

      const first = await service.completeFollowUp(created.data.id);
      expect(first.ok).toBe(true);

      const second = await service.completeFollowUp(created.data.id);
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("NO_SCHEDULED_FOLLOW_UP");
    });

    it("returns NOT_FOUND for a missing lead", async () => {
      const result = await service.completeFollowUp("does-not-exist");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    /**
     * Regression test for a real race: completeFollowUp used to be
     * read-then-write (check nextFollowUpAt is set, THEN update) at
     * the repository layer. Two concurrent calls could both pass the
     * check before either write ran, and both would then report
     * success — two callers both believing they completed the same
     * follow-up (and, via the action layer, two "follow_up_completed"
     * activities for one real event).
     *
     * Firing both calls together with Promise.all (rather than
     * sequentially, like the test above) is what actually exercises
     * this: two separate async calls started together interleave at
     * their internal await boundaries, which is exactly the window
     * the old code left open. Exactly one of the two must succeed.
     */
    it("concurrent completion attempts on the same lead: exactly one succeeds", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id, nextFollowUpAt: "2026-09-01" });
      if (!created.ok) throw new Error("setup failed");

      const [first, second] = await Promise.all([
        service.completeFollowUp(created.data.id),
        service.completeFollowUp(created.data.id),
      ]);

      const outcomes = [first, second];
      const successes = outcomes.filter((r) => r.ok);
      const failures = outcomes.filter((r) => !r.ok);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      if (!failures[0].ok) expect(failures[0].error.code).toBe("NO_SCHEDULED_FOLLOW_UP");

      // And the end state reflects exactly one completion, not a
      // double-write of any kind.
      const final = await service.getLead(created.data.id);
      expect(final.ok).toBe(true);
      if (final.ok) expect(final.data.nextFollowUpAt).toBeNull();
    });

    it("many concurrent completion attempts on the same lead: still exactly one succeeds", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id, nextFollowUpAt: "2026-09-01" });
      if (!created.ok) throw new Error("setup failed");

      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.completeFollowUp(created.data.id))
      );

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toHaveLength(9);
    });
  });

  describe("relationships", () => {
    it("getLeadsForCustomer returns the customer's leads", async () => {
      const customer = await makeCustomer(customerRepository);
      await service.createLead({ customerId: customer.id });
      await service.createLead({ customerId: customer.id });

      const leads = await service.getLeadsForCustomer(customer.id);
      expect(leads).toHaveLength(2);
    });

    it("getLeadsForVehicle returns the vehicle's leads", async () => {
      const customer = await makeCustomer(customerRepository);
      const vehicle = await makeVehicle(vehicleRepository, "SV-0002");
      await service.createLead({ customerId: customer.id, vehicleId: vehicle.id });

      const leads = await service.getLeadsForVehicle(vehicle.id);
      expect(leads).toHaveLength(1);
    });
  });

  describe("listLeadsPaged (Mission 015)", () => {
    it("paginates database-side and reports accurate totals", async () => {
      const customer = await makeCustomer(customerRepository);
      for (let i = 0; i < 5; i += 1) {
        await service.createLead({ customerId: customer.id, source: `source-${i}` });
      }

      const firstPage = await service.listLeadsPaged({ page: 1, pageSize: 2 });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.total).toBe(5);
      expect(firstPage.totalPages).toBe(3);

      const secondPage = await service.listLeadsPaged({ page: 2, pageSize: 2 });
      expect(secondPage.items).toHaveLength(2);
      expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
    });

    it("filters by lifecycle: active vs terminal", async () => {
      const customer = await makeCustomer(customerRepository);
      const a = await service.createLead({ customerId: customer.id });
      const b = await service.createLead({ customerId: customer.id });
      if (!a.ok || !b.ok) throw new Error("setup failed");
      await service.updateLeadStatus(b.data.id, "won");

      const active = await service.listLeadsPaged({ lifecycle: "active", page: 1, pageSize: 10 });
      expect(active.items.map((l) => l.id)).toEqual([a.data.id]);

      const terminal = await service.listLeadsPaged({ lifecycle: "terminal", page: 1, pageSize: 10 });
      expect(terminal.items.map((l) => l.id)).toEqual([b.data.id]);
    });

    it("filters by followUpDueBy — only active leads with a due/overdue date", async () => {
      const customer = await makeCustomer(customerRepository);
      const due = await service.createLead({ customerId: customer.id, nextFollowUpAt: "2020-01-01" });
      const future = await service.createLead({ customerId: customer.id, nextFollowUpAt: "2099-01-01" });
      const none = await service.createLead({ customerId: customer.id });
      if (!due.ok || !future.ok || !none.ok) throw new Error("setup failed");

      const result = await service.listLeadsPaged({
        followUpDueBy: "2026-01-01",
        page: 1,
        pageSize: 10,
      });
      expect(result.items.map((l) => l.id)).toEqual([due.data.id]);
    });
  });

  describe("updateLeadStatus — invalid input (Mission 011 data integrity)", () => {
    it("rejects a status value that isn't a real LeadStatus, without writing it to the database", async () => {
      const customer = await makeCustomer(customerRepository);
      const created = await service.createLead({ customerId: customer.id });
      if (!created.ok) throw new Error("setup failed");

      // Simulates a forged server-action call — bypasses TypeScript's
      // compile-time guard the same way a malicious client could.
      const forged = "definitely-not-a-status" as unknown as Parameters<
        typeof service.updateLeadStatus
      >[1];
      const result = await service.updateLeadStatus(created.data.id, forged);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");

      // Confirm the DB was never touched with the garbage value.
      const stillNew = await service.getLead(created.data.id);
      expect(stillNew.ok).toBe(true);
      if (stillNew.ok) expect(stillNew.data.status).toBe("new");
    });
  });

  describe("vehicleLabel snapshot (Mission 011)", () => {
    it("captures the vehicle's label at creation time", async () => {
      const customer = await makeCustomer(customerRepository);
      const vehicle = await makeVehicle(vehicleRepository, "VL-0001");

      const result = await service.createLead({ customerId: customer.id, vehicleId: vehicle.id });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.vehicleLabel).toBe(`${vehicle.year} ${vehicle.make} ${vehicle.model}`);
      }
    });

    it("leaves vehicleLabel null for a lead with no vehicle", async () => {
      const customer = await makeCustomer(customerRepository);
      const result = await service.createLead({ customerId: customer.id });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.vehicleLabel).toBeNull();
    });

    it("survives vehicle deletion — vehicleId is nulled but vehicleLabel remains, so the lead stays understandable", async () => {
      const { VehicleService } = await import("../../../inventory/service/vehicle-service");
      const customer = await makeCustomer(customerRepository);
      const vehicle = await makeVehicle(vehicleRepository, "VL-0002");

      const created = await service.createLead({ customerId: customer.id, vehicleId: vehicle.id });
      if (!created.ok) throw new Error("setup failed");
      const expectedLabel = created.data.vehicleLabel;

      const vehicleService = new VehicleService(vehicleRepository);
      await vehicleService.deleteVehicle(vehicle.id);

      const afterDelete = await service.getLead(created.data.id);
      expect(afterDelete.ok).toBe(true);
      if (afterDelete.ok) {
        expect(afterDelete.data.vehicleId).toBeNull();
        expect(afterDelete.data.vehicleLabel).toBe(expectedLabel);
      }
    });
  });
});

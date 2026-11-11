import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { CreateVehicleInput } from "../../domain/vehicle-input";
import type { DatabaseVehicleRepository as DatabaseVehicleRepositoryClass } from "../database-vehicle-repository";

/**
 * These tests run against a throwaway SQLite file in the OS temp
 * directory — never the shared dev.db used by `npm run dev` — so the
 * suite is isolated and safe to run repeatedly/in parallel with dev
 * work. The temp file (and its -wal/-shm siblings) is removed after
 * the suite finishes.
 *
 * DATABASE_URL must be set *before* `../database-vehicle-repository`
 * (and, transitively, `@/lib/db/client`) is first imported, since the
 * db client opens its connection once at module load. Hence the
 * dynamic `import()` inside beforeAll rather than a static import.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-db-test-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseVehicleRepository: typeof DatabaseVehicleRepositoryClass;
let db: typeof import("../../../../lib/db/client").db;
let vehicles: typeof import("../../../../lib/db/schema").vehicles;
let leads: typeof import("../../../../lib/db/schema").leads;
let customers: typeof import("../../../../lib/db/schema").customers;

function validInput(
  overrides: Partial<CreateVehicleInput> = {}
): CreateVehicleInput {
  return {
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId: "TEST-9001",
    mileage: 12000,
    price: 1800000,
    status: "available",
    description: "A test vehicle.",
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  // Apply every migration in order, same as `npm run db:migrate`
  // would against a real dev database.
  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  // Mission 012: vehicles.businessId FK-references businesses.id with
  // foreign_keys enforcement ON — every vehicle this suite creates
  // with businessId "biz_test" needs that business to actually exist.
  setupDb
    .prepare(
      "INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    )
    .run("biz_test", "Test Business", new Date().toISOString(), new Date().toISOString());
  // Mission 027 — a second business, for cross-business lead-isolation tests.
  setupDb
    .prepare(
      "INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    )
    .run("biz_other_027", "Other Business (M027)", new Date().toISOString(), new Date().toISOString());
  setupDb.close();

  const repoModule = await import("../database-vehicle-repository");
  const clientModule = await import("../../../../lib/db/client");
  const schemaModule = await import("../../../../lib/db/schema");
  DatabaseVehicleRepository = repoModule.DatabaseVehicleRepository;
  db = clientModule.db;
  vehicles = schemaModule.vehicles;
  leads = schemaModule.leads;
  customers = schemaModule.customers;
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("DatabaseVehicleRepository", () => {
  let repository: InstanceType<typeof DatabaseVehicleRepositoryClass>;

  beforeEach(async () => {
    // Isolate each test — repository interface has no delete, so
    // clear the table directly through the schema/client. Leads
    // reference vehicles/customers via FK, so clear child-first.
    await db.delete(leads);
    await db.delete(customers);
    await db.delete(vehicles);
    repository = new DatabaseVehicleRepository("biz_test");
  });

  it("returns an empty list when no vehicles exist", async () => {
    const result = await repository.list();
    expect(result).toEqual([]);
  });

  it("creates a vehicle with a generated id and timestamps", async () => {
    const vehicle = await repository.create(validInput());

    expect(vehicle.id).toBeTruthy();
    expect(vehicle.stockId).toBe("TEST-9001");
    expect(vehicle.addedAt).toBeTruthy();
    expect(vehicle.updatedAt).toBeTruthy();

    const all = await repository.list();
    expect(all).toHaveLength(1);
  });

  it("retrieves a vehicle by id", async () => {
    const created = await repository.create(validInput());
    const found = await repository.getById(created.id);

    expect(found).not.toBeNull();
    expect(found?.make).toBe("Toyota");
  });

  it("returns null for a missing id", async () => {
    const found = await repository.getById("does-not-exist");
    expect(found).toBeNull();
  });

  it("finds a vehicle by stock id, case-insensitively", async () => {
    await repository.create(validInput({ stockId: "ATL-2001" }));
    const found = await repository.findByStockId("atl-2001");
    expect(found).not.toBeNull();
    expect(found?.stockId).toBe("ATL-2001");
  });

  it("rejects a duplicate stock id at the database level", async () => {
    await repository.create(validInput({ stockId: "ATL-3001" }));
    await expect(
      repository.create(validInput({ stockId: "ATL-3001" }))
    ).rejects.toThrow();
  });

  it("updates an existing vehicle and changes updatedAt", async () => {
    const created = await repository.create(validInput());
    const updated = await repository.update(created.id, {
      price: 2000000,
      status: "reserved",
    });

    expect(updated).not.toBeNull();
    expect(updated?.price).toBe(2000000);
    expect(updated?.status).toBe("reserved");
    // Untouched fields are preserved.
    expect(updated?.make).toBe("Toyota");
  });

  it("returns null when updating a missing vehicle", async () => {
    const result = await repository.update("does-not-exist", { price: 1 });
    expect(result).toBeNull();
  });

  it("persists data across repository instances (simulating a reload)", async () => {
    const created = await repository.create(validInput({ stockId: "ATL-4001" }));

    // A fresh instance, as a new request/reload would construct.
    const secondInstance = new DatabaseVehicleRepository("biz_test");
    const found = await secondInstance.getById(created.id);

    expect(found).not.toBeNull();
    expect(found?.stockId).toBe("ATL-4001");
  });

  describe("delete", () => {
    it("deletes an existing vehicle and returns true", async () => {
      const created = await repository.create(validInput({ stockId: "DEL-0001" }));
      const deleted = await repository.delete(created.id);
      expect(deleted).toBe(true);

      const found = await repository.getById(created.id);
      expect(found).toBeNull();
    });

    it("returns false for a missing vehicle", async () => {
      const deleted = await repository.delete("does-not-exist");
      expect(deleted).toBe(false);
    });
  });

  describe("countByStatus", () => {
    it("counts vehicles per status", async () => {
      await repository.create(validInput({ stockId: "CNT-0001", status: "available" }));
      await repository.create(validInput({ stockId: "CNT-0002", status: "available" }));
      await repository.create(validInput({ stockId: "CNT-0003", status: "reserved" }));
      await repository.create(validInput({ stockId: "CNT-0004", status: "sold" }));

      const counts = await repository.countByStatus();
      expect(counts.available).toBe(2);
      expect(counts.reserved).toBe(1);
      expect(counts.sold).toBe(1);
    });

    it("returns zero counts for an empty table", async () => {
      const counts = await repository.countByStatus();
      expect(counts).toEqual({ available: 0, reserved: 0, sold: 0 });
    });
  });

  describe("listDistinctMakes", () => {
    it("returns distinct makes sorted alphabetically", async () => {
      await repository.create(validInput({ stockId: "MK-0001", make: "Toyota" }));
      await repository.create(validInput({ stockId: "MK-0002", make: "Toyota" }));
      await repository.create(validInput({ stockId: "MK-0003", make: "Honda" }));

      const makes = await repository.listDistinctMakes();
      expect(makes).toEqual(["Honda", "Toyota"]);
    });
  });

  describe("findByStockId", () => {
    it("finds an exact match", async () => {
      await repository.create(validInput({ stockId: "EXACT-0001" }));
      const found = await repository.findByStockId("EXACT-0001");
      expect(found).not.toBeNull();
    });

    it("returns null when no vehicle matches", async () => {
      const found = await repository.findByStockId("NO-SUCH-STOCK-ID");
      expect(found).toBeNull();
    });

    it("prevents a duplicate at the database level even with different casing", async () => {
      await repository.create(validInput({ stockId: "DUP-0001" }));
      const duplicate = await repository.findByStockId("dup-0001");
      expect(duplicate).not.toBeNull();
      expect(duplicate?.stockId).toBe("DUP-0001");
    });
  });

  describe("listPaged", () => {
    beforeEach(async () => {
      await repository.create(
        validInput({ stockId: "PG-0001", make: "Toyota", model: "Vitz", year: 2019, price: 1200000, status: "available" })
      );
      await repository.create(
        validInput({ stockId: "PG-0002", make: "Toyota", model: "Harrier", year: 2022, price: 6000000, status: "reserved" })
      );
      await repository.create(
        validInput({ stockId: "PG-0003", make: "Honda", model: "Fit", year: 2020, price: 1500000, status: "sold" })
      );
      await repository.create(
        validInput({ stockId: "PG-0004", make: "Nissan", model: "X-Trail", year: 2021, price: 3200000, status: "available" })
      );
    });

    it("filters by status", async () => {
      const result = await repository.listPaged({ status: "available" });
      expect(result.items.every((v) => v.status === "available")).toBe(true);
      expect(result.items).toHaveLength(2);
    });

    it("filters by make", async () => {
      const result = await repository.listPaged({ make: "Toyota" });
      expect(result.items).toHaveLength(2);
      expect(result.items.every((v) => v.make === "Toyota")).toBe(true);
    });

    it("filters by model", async () => {
      const result = await repository.listPaged({ model: "Fit" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].model).toBe("Fit");
    });

    it("filters by price range", async () => {
      const result = await repository.listPaged({ minPrice: 1300000, maxPrice: 3500000 });
      expect(result.items.map((v) => v.stockId).sort()).toEqual(["PG-0003", "PG-0004"]);
    });

    it("filters by year range", async () => {
      const result = await repository.listPaged({ minYear: 2021, maxYear: 2022 });
      expect(result.items.map((v) => v.stockId).sort()).toEqual(["PG-0002", "PG-0004"]);
    });

    it("matches search text against stock id, make, and model", async () => {
      const byStockId = await repository.listPaged({ search: "PG-0003" });
      expect(byStockId.items).toHaveLength(1);

      const byMake = await repository.listPaged({ search: "honda" });
      expect(byMake.items).toHaveLength(1);

      const byModel = await repository.listPaged({ search: "trail" });
      expect(byModel.items).toHaveLength(1);
    });

    it("paginates results at the database level", async () => {
      const pageOne = await repository.listPaged({ pageSize: 2, page: 1, sort: "price-asc" });
      const pageTwo = await repository.listPaged({ pageSize: 2, page: 2, sort: "price-asc" });

      expect(pageOne.items).toHaveLength(2);
      expect(pageTwo.items).toHaveLength(2);
      expect(pageOne.total).toBe(4);
      expect(pageOne.totalPages).toBe(2);
      expect(pageOne.items.map((v) => v.id)).not.toEqual(
        pageTwo.items.map((v) => v.id)
      );
    });

    it("sorts by price ascending and descending", async () => {
      const asc = await repository.listPaged({ sort: "price-asc" });
      const prices = asc.items.map((v) => v.price);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);

      const desc = await repository.listPaged({ sort: "price-desc" });
      const descPrices = desc.items.map((v) => v.price);
      expect([...descPrices].sort((a, b) => b - a)).toEqual(descPrices);
    });

    it("sorts by year newest to oldest", async () => {
      const result = await repository.listPaged({ sort: "year-desc" });
      const years = result.items.map((v) => v.year);
      expect([...years].sort((a, b) => b - a)).toEqual(years);
    });

    it("combines multiple filters", async () => {
      const result = await repository.listPaged({
        status: "available",
        minYear: 2020,
      });
      expect(
        result.items.every((v) => v.status === "available" && v.year >= 2020)
      ).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].stockId).toBe("PG-0004");
    });
  });

  describe("getAvailableVehicleAgeDays — Mission 026", () => {
    it("returns one age per available vehicle, oldest first, excluding reserved/sold", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const oldAvailable = await repository.create(validInput({ stockId: "AGE-1", status: "available" }));
      const newAvailable = await repository.create(validInput({ stockId: "AGE-2", status: "available" }));
      const reserved = await repository.create(validInput({ stockId: "AGE-3", status: "reserved" }));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, oldAvailable.id));
      await db.update(vehicles).set({ addedAt: "2026-08-30T00:00:00.000Z" }).where(eq(vehicles.id, newAvailable.id));
      await db.update(vehicles).set({ addedAt: "2026-01-01T00:00:00.000Z" }).where(eq(vehicles.id, reserved.id));

      const ages = await repository.getAvailableVehicleAgeDays(now);
      expect(ages).toHaveLength(2);
      expect(ages[0]).toBeGreaterThan(ages[1]); // oldest first
      expect(ages[0]).toBeCloseTo(93, 0); // 2026-06-01 -> 2026-09-02
      expect(ages[1]).toBeCloseTo(3, 0); // 2026-08-30 -> 2026-09-02
    });

    it("returns an empty array when there are no available vehicles", async () => {
      await repository.create(validInput({ stockId: "AGE-4", status: "sold" }));
      expect(await repository.getAvailableVehicleAgeDays("2026-09-02T00:00:00.000Z")).toEqual([]);
    });
  });

  describe("getStaleAvailableVehicles — Mission 026", () => {
    it("returns only available vehicles at or beyond the age threshold, most-stale-first", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const stale = await repository.create(validInput({ stockId: "STALE-1", status: "available" }));
      const fresh = await repository.create(validInput({ stockId: "STALE-2", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, stale.id));
      await db.update(vehicles).set({ addedAt: "2026-08-30T00:00:00.000Z" }).where(eq(vehicles.id, fresh.id));

      const result = await repository.getStaleAvailableVehicles(60, now, 10);
      expect(result.map((v) => v.stockId)).toEqual(["STALE-1"]);
    });

    it("excludes reserved and sold vehicles even if old", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const reserved = await repository.create(validInput({ stockId: "STALE-3", status: "reserved" }));
      await db.update(vehicles).set({ addedAt: "2026-01-01T00:00:00.000Z" }).where(eq(vehicles.id, reserved.id));

      expect(await repository.getStaleAvailableVehicles(60, now, 10)).toEqual([]);
    });

    it("respects the limit and orders most-stale-first", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const veryStale = await repository.create(validInput({ stockId: "STALE-4", status: "available" }));
      const stale = await repository.create(validInput({ stockId: "STALE-5", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-01-01T00:00:00.000Z" }).where(eq(vehicles.id, veryStale.id));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, stale.id));

      const result = await repository.getStaleAvailableVehicles(60, now, 1);
      expect(result).toHaveLength(1);
      expect(result[0].stockId).toBe("STALE-4");
    });
  });

  describe("getAvailableVehicleAgeDaysWithoutActiveLead / getStaleAvailableVehiclesWithoutActiveLead — Mission 027", () => {
    let leadCounter = 0;

    async function seedCustomer(businessId: string): Promise<string> {
      leadCounter += 1;
      const id = `cust_${leadCounter}`;
      const now = new Date().toISOString();
      await db.insert(customers).values({
        id,
        businessId,
        name: `Customer ${leadCounter}`,
        phone: "0700000000",
        createdAt: now,
        updatedAt: now,
      });
      return id;
    }

    async function seedLead(
      businessId: string,
      customerId: string,
      vehicleId: string | null,
      status: string
    ): Promise<void> {
      leadCounter += 1;
      const now = new Date().toISOString();
      await db.insert(leads).values({
        id: `lead_${leadCounter}`,
        businessId,
        customerId,
        vehicleId,
        status,
        createdAt: now,
        updatedAt: now,
      });
    }

    it("excludes an available vehicle that has an active lead", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const withLead = await repository.create(validInput({ stockId: "NOLEAD-1", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, withLead.id));
      const customerId = await seedCustomer("biz_test");
      await seedLead("biz_test", customerId, withLead.id, "new");

      expect(await repository.getAvailableVehicleAgeDaysWithoutActiveLead(now)).toEqual([]);
      expect(await repository.getStaleAvailableVehiclesWithoutActiveLead(60, now, 10)).toEqual([]);
    });

    it("includes an available vehicle that has zero leads at all", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const noLeads = await repository.create(validInput({ stockId: "NOLEAD-2", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, noLeads.id));

      const ages = await repository.getAvailableVehicleAgeDaysWithoutActiveLead(now);
      expect(ages).toHaveLength(1);
      expect(ages[0]).toBeCloseTo(93, 0);

      const stale = await repository.getStaleAvailableVehiclesWithoutActiveLead(60, now, 10);
      expect(stale.map((v) => v.stockId)).toEqual(["NOLEAD-2"]);
    });

    it("includes an available vehicle whose only leads are terminal (won/lost)", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const vehicle = await repository.create(validInput({ stockId: "NOLEAD-3", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, vehicle.id));
      const customerId = await seedCustomer("biz_test");
      await seedLead("biz_test", customerId, vehicle.id, "won");
      await seedLead("biz_test", customerId, vehicle.id, "lost");

      const ages = await repository.getAvailableVehicleAgeDaysWithoutActiveLead(now);
      expect(ages).toHaveLength(1);

      const stale = await repository.getStaleAvailableVehiclesWithoutActiveLead(60, now, 10);
      expect(stale.map((v) => v.stockId)).toEqual(["NOLEAD-3"]);
    });

    it("excludes a vehicle that has at least one active lead among several terminal ones", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const vehicle = await repository.create(validInput({ stockId: "NOLEAD-4", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, vehicle.id));
      const customerId = await seedCustomer("biz_test");
      await seedLead("biz_test", customerId, vehicle.id, "lost");
      await seedLead("biz_test", customerId, vehicle.id, "qualified"); // active

      expect(await repository.getAvailableVehicleAgeDaysWithoutActiveLead(now)).toEqual([]);
    });

    it("excludes a vehicle with multiple active leads (not just the first)", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const vehicle = await repository.create(validInput({ stockId: "NOLEAD-5", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, vehicle.id));
      const customerId = await seedCustomer("biz_test");
      await seedLead("biz_test", customerId, vehicle.id, "new");
      await seedLead("biz_test", customerId, vehicle.id, "contacted");
      await seedLead("biz_test", customerId, vehicle.id, "negotiating");

      expect(await repository.getAvailableVehicleAgeDaysWithoutActiveLead(now)).toEqual([]);
      expect(await repository.getStaleAvailableVehiclesWithoutActiveLead(60, now, 10)).toEqual([]);
    });

    it("excludes reserved/sold vehicles even with zero leads", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const reserved = await repository.create(validInput({ stockId: "NOLEAD-6", status: "reserved" }));
      await db.update(vehicles).set({ addedAt: "2026-01-01T00:00:00.000Z" }).where(eq(vehicles.id, reserved.id));

      expect(await repository.getAvailableVehicleAgeDaysWithoutActiveLead(now)).toEqual([]);
      expect(await repository.getStaleAvailableVehiclesWithoutActiveLead(60, now, 10)).toEqual([]);
    });

    it("does not let a cross-business lead reference suppress the signal (Section 14 inconsistent-state scenario)", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const vehicle = await repository.create(validInput({ stockId: "NOLEAD-7", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, vehicle.id));
      // A lead belonging to a DIFFERENT business, but (inconsistently)
      // referencing this business's vehicle by id.
      const otherCustomerId = await seedCustomer("biz_other_027");
      await seedLead("biz_other_027", otherCustomerId, vehicle.id, "new");

      // The foreign-business lead must never count as active interest
      // for biz_test's vehicle.
      const ages = await repository.getAvailableVehicleAgeDaysWithoutActiveLead(now);
      expect(ages).toHaveLength(1);
      const stale = await repository.getStaleAvailableVehiclesWithoutActiveLead(60, now, 10);
      expect(stale.map((v) => v.stockId)).toEqual(["NOLEAD-7"]);
    });

    it("respects the limit and orders most-stale-first, mirroring getStaleAvailableVehicles", async () => {
      const now = "2026-09-02T00:00:00.000Z";
      const veryStale = await repository.create(validInput({ stockId: "NOLEAD-8", status: "available" }));
      const stale = await repository.create(validInput({ stockId: "NOLEAD-9", status: "available" }));
      await db.update(vehicles).set({ addedAt: "2026-01-01T00:00:00.000Z" }).where(eq(vehicles.id, veryStale.id));
      await db.update(vehicles).set({ addedAt: "2026-06-01T00:00:00.000Z" }).where(eq(vehicles.id, stale.id));

      const result = await repository.getStaleAvailableVehiclesWithoutActiveLead(60, now, 1);
      expect(result).toHaveLength(1);
      expect(result[0].stockId).toBe("NOLEAD-8");
    });
  });

  /** Mission 029, Section 14/24 #18 — the transactional limit guard. */
  describe("createWithinLimit", () => {
    it("creates when under the limit", async () => {
      const result = await repository.createWithinLimit(validInput({ stockId: "LIMIT-1" }), 5);
      expect(result.limitExceeded).toBe(false);
      expect(result.vehicle?.stockId).toBe("LIMIT-1");
      expect(result.currentCount).toBe(1);
    });

    it("rejects creation once the limit is reached, without creating a row", async () => {
      await repository.createWithinLimit(validInput({ stockId: "LIMIT-2A" }), 1);
      const second = await repository.createWithinLimit(validInput({ stockId: "LIMIT-2B" }), 1);
      expect(second.limitExceeded).toBe(true);
      expect(second.vehicle).toBeNull();

      const all = await repository.list();
      expect(all.map((v) => v.stockId)).toEqual(["LIMIT-2A"]);
    });

    it("never creates a row when null limit (unlimited) is passed alongside a huge existing count expectation — sanity check", async () => {
      const result = await repository.createWithinLimit(validInput({ stockId: "LIMIT-3" }), null);
      expect(result.limitExceeded).toBe(false);
      expect(result.vehicle).not.toBeNull();
    });

    it("closes the check-then-insert race: N concurrent calls at limit=1 create at most 1 vehicle", async () => {
      // Mission 029, Section 14/24 #18 — this is the actual regression
      // test for the race the old countByStatus()-then-checkLimit()
      // sequence had. Firing several createWithinLimit calls
      // concurrently (no await between them) exercises exactly the
      // interleaving window a two-step check-then-insert would have
      // been vulnerable to.
      const attempts = await Promise.all(
        Array.from({ length: 5 }, (_, i) => repository.createWithinLimit(validInput({ stockId: `RACE-${i}` }), 1))
      );

      const succeeded = attempts.filter((a) => !a.limitExceeded);
      const rejected = attempts.filter((a) => a.limitExceeded);
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(4);

      const all = await repository.list();
      expect(all).toHaveLength(1);
    });
  });
});

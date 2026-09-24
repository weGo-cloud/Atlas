import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseVehicleRepository as VehicleRepoClass } from "../database-vehicle-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-isolation-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseVehicleRepository: typeof VehicleRepoClass;
let rawDb: Database.Database;

const BUSINESS_A = "biz_isolation_a";
const BUSINESS_B = "biz_isolation_b";

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

  const repoModule = await import("../database-vehicle-repository");
  DatabaseVehicleRepository = repoModule.DatabaseVehicleRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

function validInput(stockId: string) {
  return {
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId,
    mileage: 10000,
    price: 1000000,
    status: "available" as const,
    description: "Isolation test vehicle.",
  };
}

describe("Cross-business vehicle isolation (Mission 012, Phase 7 — critical)", () => {
  let repoA: InstanceType<typeof VehicleRepoClass>;
  let repoB: InstanceType<typeof VehicleRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM leads; DELETE FROM vehicle_photos; DELETE FROM vehicles;");
    repoA = new DatabaseVehicleRepository(BUSINESS_A);
    repoB = new DatabaseVehicleRepository(BUSINESS_B);
  });

  it("business B cannot read business A's vehicle by id", async () => {
    const vehicleA = await repoA.create(validInput("ISO-A-0001"));
    const found = await repoB.getById(vehicleA.id);
    expect(found).toBeNull();
  });

  it("business A can read its own vehicle by the same id business B can't see", async () => {
    const vehicleA = await repoA.create(validInput("ISO-A-0002"));
    const found = await repoA.getById(vehicleA.id);
    expect(found).not.toBeNull();
  });

  it("business B's list() never includes business A's vehicles", async () => {
    await repoA.create(validInput("ISO-A-0003"));
    await repoB.create(validInput("ISO-B-0001"));

    const listA = await repoA.list();
    const listB = await repoB.list();

    expect(listA.every((v) => v.stockId.startsWith("ISO-A"))).toBe(true);
    expect(listB.every((v) => v.stockId.startsWith("ISO-B"))).toBe(true);
    expect(listB.some((v) => v.stockId.startsWith("ISO-A"))).toBe(false);
  });

  it("business B's listPaged() never includes business A's vehicles, even with an empty filter", async () => {
    await repoA.create(validInput("ISO-A-0004"));
    await repoA.create(validInput("ISO-A-0005"));
    await repoB.create(validInput("ISO-B-0002"));

    const result = await repoB.listPaged({});
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0].stockId).toBe("ISO-B-0002");
  });

  it("business B cannot update business A's vehicle by manipulating the id", async () => {
    const vehicleA = await repoA.create(validInput("ISO-A-0006"));
    const updated = await repoB.update(vehicleA.id, { price: 1 });
    expect(updated).toBeNull();

    // Confirm business A's data is genuinely untouched.
    const stillA = await repoA.getById(vehicleA.id);
    expect(stillA?.price).toBe(1000000);
  });

  it("business B cannot delete business A's vehicle by manipulating the id", async () => {
    const vehicleA = await repoA.create(validInput("ISO-A-0007"));
    const deleted = await repoB.delete(vehicleA.id);
    expect(deleted).toBe(false);

    const stillA = await repoA.getById(vehicleA.id);
    expect(stillA).not.toBeNull();
  });

  it("business B cannot resolve business A's vehicle via getByIds, even when it asks for it explicitly", async () => {
    const vehicleA = await repoA.create(validInput("ISO-A-0008"));
    const vehicleB = await repoB.create(validInput("ISO-B-0003"));

    // Business B tries to probe for both its own and A's vehicle id
    // in one call — a manipulated-id attack surface.
    const result = await repoB.getByIds([vehicleA.id, vehicleB.id]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(vehicleB.id);
  });

  it("countByStatus is scoped per business", async () => {
    await repoA.create(validInput("ISO-A-0009"));
    await repoA.create(validInput("ISO-A-0010"));
    await repoB.create(validInput("ISO-B-0004"));

    const countsA = await repoA.countByStatus();
    const countsB = await repoB.countByStatus();

    expect(countsA.available).toBe(2);
    expect(countsB.available).toBe(1);
  });

  it("getActiveInventoryValueStats is scoped per business", async () => {
    await repoA.create({ ...validInput("ISO-A-0011"), price: 5000000 });
    await repoB.create({ ...validInput("ISO-B-0005"), price: 9999999 });

    const statsA = await repoA.getActiveInventoryValueStats();
    expect(statsA.totalValue).toBe(5000000);
    expect(statsA.totalValue).not.toBe(9999999);
  });

  it("listDistinctMakes is scoped per business", async () => {
    await repoA.create({ ...validInput("ISO-A-0012"), make: "Toyota" });
    await repoB.create({ ...validInput("ISO-B-0006"), make: "Ferrari" });

    const makesA = await repoA.listDistinctMakes();
    expect(makesA).toEqual(["Toyota"]);
    expect(makesA).not.toContain("Ferrari");
  });

  it("findByStockId cannot leak another business's vehicle even with the exact right stock id", async () => {
    await repoA.create(validInput("ISO-SHARED-0001"));
    // Different businesses CAN use the same stock id (no global
    // uniqueness assumption baked into ownership) — business B has
    // no vehicle with this stock id, so it must find nothing, not
    // business A's.
    const found = await repoB.findByStockId("ISO-SHARED-0001");
    expect(found).toBeNull();
  });

  it("a freshly created vehicle is always stamped with the constructing repository's businessId, never a caller-supplied value", async () => {
    // CreateVehicleInput has no businessId field at all — this test
    // documents and locks in that the only source of truth is which
    // repository instance you call through.
    const vehicleA = await repoA.create(validInput("ISO-A-0013"));
    expect(vehicleA.businessId).toBe(BUSINESS_A);

    const vehicleB = await repoB.create(validInput("ISO-B-0007"));
    expect(vehicleB.businessId).toBe(BUSINESS_B);
  });
});

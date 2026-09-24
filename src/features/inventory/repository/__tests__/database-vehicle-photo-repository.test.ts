import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseVehiclePhotoRepository as PhotoRepoClass } from "../database-vehicle-photo-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../database-vehicle-repository";

/**
 * Isolated temp SQLite file — never the shared dev.db. DATABASE_URL
 * must be set before the db client module is first imported (it opens
 * its connection once, at load time), hence the dynamic import()
 * inside beforeAll.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-photo-db-test-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseVehiclePhotoRepository: typeof PhotoRepoClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
let rawDb: Database.Database;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  setupDb.close();

  const photoRepoModule = await import("../database-vehicle-photo-repository");
  const vehicleRepoModule = await import("../database-vehicle-repository");
  DatabaseVehiclePhotoRepository = photoRepoModule.DatabaseVehiclePhotoRepository;
  DatabaseVehicleRepository = vehicleRepoModule.DatabaseVehicleRepository;

  // Raw connection for direct assertions/cleanup not exposed by the
  // repository interfaces (e.g. simulating a vehicle delete for the
  // cascade test — there's no deleteVehicle feature in the app yet).
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

async function createTestVehicle(
  vehicleRepository: InstanceType<typeof VehicleRepoClass>,
  stockId: string
) {
  return vehicleRepository.create({
    make: "Toyota",
    model: "Vitz",
    year: 2021,
    stockId,
    mileage: 12000,
    price: 1800000,
    status: "available",
    description: "A test vehicle.",
  });
}

describe("DatabaseVehiclePhotoRepository", () => {
  let photoRepository: InstanceType<typeof PhotoRepoClass>;
  let vehicleRepository: InstanceType<typeof VehicleRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM vehicle_photos; DELETE FROM vehicles;");
    photoRepository = new DatabaseVehiclePhotoRepository();
    vehicleRepository = new DatabaseVehicleRepository("biz_test");
  });

  it("returns an empty list for a vehicle with no photos", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0001");
    const photos = await photoRepository.listByVehicleId(vehicle.id);
    expect(photos).toEqual([]);
  });

  it("makes the first added photo primary automatically", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0002");
    const photo = await photoRepository.add({
      vehicleId: vehicle.id,
      url: "/uploads/vehicles/x/a.jpg",
    });

    expect(photo.isPrimary).toBe(true);
    expect(photo.position).toBe(0);
  });

  it("does not make subsequent photos primary", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0003");
    await photoRepository.add({ vehicleId: vehicle.id, url: "/a.jpg" });
    const second = await photoRepository.add({ vehicleId: vehicle.id, url: "/b.jpg" });

    expect(second.isPrimary).toBe(false);
    expect(second.position).toBe(1);
  });

  it("lists photos for a vehicle in position order", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0004");
    await photoRepository.add({ vehicleId: vehicle.id, url: "/a.jpg" });
    await photoRepository.add({ vehicleId: vehicle.id, url: "/b.jpg" });
    await photoRepository.add({ vehicleId: vehicle.id, url: "/c.jpg" });

    const photos = await photoRepository.listByVehicleId(vehicle.id);
    expect(photos.map((p) => p.url)).toEqual(["/a.jpg", "/b.jpg", "/c.jpg"]);
  });

  it("reorders photos and persists the new position", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0005");
    const a = await photoRepository.add({ vehicleId: vehicle.id, url: "/a.jpg" });
    const b = await photoRepository.add({ vehicleId: vehicle.id, url: "/b.jpg" });
    const c = await photoRepository.add({ vehicleId: vehicle.id, url: "/c.jpg" });

    const reordered = await photoRepository.reorder(vehicle.id, [c.id, a.id, b.id]);
    expect(reordered.map((p) => p.url)).toEqual(["/c.jpg", "/a.jpg", "/b.jpg"]);
  });

  it("ignores foreign ids passed to reorder", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0006");
    const a = await photoRepository.add({ vehicleId: vehicle.id, url: "/a.jpg" });
    const b = await photoRepository.add({ vehicleId: vehicle.id, url: "/b.jpg" });

    const reordered = await photoRepository.reorder(vehicle.id, [
      "not-a-real-id",
      b.id,
      a.id,
    ]);
    expect(reordered.map((p) => p.url)).toEqual(["/b.jpg", "/a.jpg"]);
  });

  it("setPrimary makes exactly one photo primary", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0007");
    const a = await photoRepository.add({ vehicleId: vehicle.id, url: "/a.jpg" });
    const b = await photoRepository.add({ vehicleId: vehicle.id, url: "/b.jpg" });

    const result = await photoRepository.setPrimary(vehicle.id, b.id);
    const primaries = result.filter((p) => p.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe(b.id);
    expect(result.find((p) => p.id === a.id)?.isPrimary).toBe(false);
  });

  it("promotes the next photo to primary after the primary is removed", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0008");
    const a = await photoRepository.add({ vehicleId: vehicle.id, url: "/a.jpg" });
    await photoRepository.add({ vehicleId: vehicle.id, url: "/b.jpg" });

    expect(a.isPrimary).toBe(true);
    await photoRepository.remove(a.id);

    const remaining = await photoRepository.listByVehicleId(vehicle.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isPrimary).toBe(true);
  });

  it("remove returns false for a missing photo id", async () => {
    const removed = await photoRepository.remove("does-not-exist");
    expect(removed).toBe(false);
  });

  it("batches primary photo lookup across multiple vehicles", async () => {
    const v1 = await createTestVehicle(vehicleRepository, "PH-0009");
    const v2 = await createTestVehicle(vehicleRepository, "PH-0010");
    await photoRepository.add({ vehicleId: v1.id, url: "/v1.jpg" });
    // v2 has no photos.

    const primaries = await photoRepository.listPrimaryForVehicleIds([
      v1.id,
      v2.id,
    ]);
    expect(primaries.size).toBe(1);
    expect(primaries.get(v1.id)?.url).toBe("/v1.jpg");
    expect(primaries.has(v2.id)).toBe(false);
  });

  it("cascades: deleting a vehicle removes its photo rows", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "PH-0011");
    await photoRepository.add({ vehicleId: vehicle.id, url: "/a.jpg" });
    await photoRepository.add({ vehicleId: vehicle.id, url: "/b.jpg" });

    // There's no delete-vehicle feature in the app yet — this
    // simulates one directly to prove the FK constraint holds.
    rawDb.prepare("DELETE FROM vehicles WHERE id = ?").run(vehicle.id);

    const remaining = await photoRepository.listByVehicleId(vehicle.id);
    expect(remaining).toEqual([]);
  });
});

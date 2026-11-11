import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { VehicleService as VehicleServiceClass } from "../vehicle-service";
import type { DatabaseVehiclePhotoRepository as PhotoRepoClass } from "../../repository/database-vehicle-photo-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../repository/database-vehicle-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const dbDir = mkdtempSync(path.join(tmpdir(), "atlas-delete-db-"));
const storageDir = mkdtempSync(path.join(tmpdir(), "atlas-delete-storage-"));
const testDbPath = path.join(dbDir, "test.db");

let VehicleService: typeof VehicleServiceClass;
let DatabaseVehiclePhotoRepository: typeof PhotoRepoClass;
let DatabaseVehicleRepository: typeof VehicleRepoClass;
let rawDb: Database.Database;

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;
  process.env.VEHICLE_PHOTO_STORAGE_DIR = storageDir;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  setupDb.close();

  const serviceModule = await import("../vehicle-service");
  const photoRepoModule = await import("../../repository/database-vehicle-photo-repository");
  const vehicleRepoModule = await import("../../repository/database-vehicle-repository");
  VehicleService = serviceModule.VehicleService;
  DatabaseVehiclePhotoRepository = photoRepoModule.DatabaseVehiclePhotoRepository;
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
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(storageDir, { recursive: true, force: true });
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

describe("VehicleService.deleteVehicle (with photo cleanup)", () => {
  let service: InstanceType<typeof VehicleServiceClass>;
  let vehicleRepository: InstanceType<typeof VehicleRepoClass>;
  let photoRepository: InstanceType<typeof PhotoRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM vehicle_photos; DELETE FROM vehicles;");
    vehicleRepository = new DatabaseVehicleRepository("biz_test");
    photoRepository = new DatabaseVehiclePhotoRepository();
    service = new VehicleService(vehicleRepository, photoRepository);
  });

  it("deletes a vehicle with no photos cleanly", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "DV-0001");
    const result = await service.deleteVehicle(vehicle.id);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.mediaCleanupFailures).toBe(0);

    const found = await vehicleRepository.getById(vehicle.id);
    expect(found).toBeNull();
  });

  it("cascades photo metadata and removes photo files from disk", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "DV-0002");
    const photo1 = await photoRepository.add({
      vehicleId: vehicle.id,
      url: "/uploads/vehicles/placeholder/a.jpg",
    });

    // Use the real storage module so there's an actual file on disk
    // to verify gets cleaned up — not just a DB row referencing one.
    const { saveVehiclePhoto } = await import("@/lib/storage/vehicle-photo-storage");
    const saved = await saveVehiclePhoto({
      vehicleId: vehicle.id,
      buffer: JPEG_HEADER,
      mimeType: "image/jpeg",
    });
    // Replace the placeholder-url photo row with one pointing at the
    // real saved file so deleteVehicle's cleanup step has something
    // real to remove.
    await photoRepository.remove(photo1.id);
    await photoRepository.add({ vehicleId: vehicle.id, url: saved.url });

    expect(existsSync(saved.storedPath)).toBe(true);

    const result = await service.deleteVehicle(vehicle.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.mediaCleanupFailures).toBe(0);

    // DB row and cascaded photo metadata are gone.
    expect(await vehicleRepository.getById(vehicle.id)).toBeNull();
    const remainingPhotoRows = rawDb
      .prepare("SELECT COUNT(*) as c FROM vehicle_photos WHERE vehicle_id = ?")
      .get(vehicle.id) as { c: number };
    expect(remainingPhotoRows.c).toBe(0);

    // And the actual file is gone from disk.
    expect(existsSync(saved.storedPath)).toBe(false);
  });

  it("still deletes the vehicle even if a photo file is already missing from disk", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "DV-0003");
    // Points at a file that was never actually written — simulates a
    // pre-existing orphan/inconsistency, which should not block
    // deletion (best-effort cleanup, not a hard requirement).
    await photoRepository.add({
      vehicleId: vehicle.id,
      url: "/uploads/vehicles/does-not-exist/missing.jpg",
    });

    const result = await service.deleteVehicle(vehicle.id);
    expect(result.ok).toBe(true);
    // deleteVehiclePhoto treats a missing file as already-deleted
    // (idempotent), so this should NOT count as a cleanup failure.
    if (result.ok) expect(result.data.mediaCleanupFailures).toBe(0);

    expect(await vehicleRepository.getById(vehicle.id)).toBeNull();
  });

  it("returns NOT_FOUND for a missing vehicle", async () => {
    const result = await service.deleteVehicle("does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("works without a photoRepository (skips cleanup, still deletes)", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "DV-0004");
    const serviceWithoutPhotos = new VehicleService(vehicleRepository);

    const result = await serviceWithoutPhotos.deleteVehicle(vehicle.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.mediaCleanupFailures).toBe(0);
    expect(await vehicleRepository.getById(vehicle.id)).toBeNull();
  });
});

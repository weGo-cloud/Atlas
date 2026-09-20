import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { VehiclePhotoService as VehiclePhotoServiceClass } from "../vehicle-photo-service";
import type { DatabaseVehiclePhotoRepository as PhotoRepoClass } from "../../repository/database-vehicle-photo-repository";
import type { DatabaseVehicleRepository as VehicleRepoClass } from "../../repository/database-vehicle-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const dbDir = mkdtempSync(path.join(tmpdir(), "atlas-photo-service-db-"));
const storageDir = mkdtempSync(path.join(tmpdir(), "atlas-photo-service-storage-"));
const testDbPath = path.join(dbDir, "test.db");

let VehiclePhotoService: typeof VehiclePhotoServiceClass;
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

  const serviceModule = await import("../vehicle-photo-service");
  const photoRepoModule = await import("../../repository/database-vehicle-photo-repository");
  const vehicleRepoModule = await import("../../repository/database-vehicle-repository");
  VehiclePhotoService = serviceModule.VehiclePhotoService;
  DatabaseVehiclePhotoRepository = photoRepoModule.DatabaseVehiclePhotoRepository;
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

describe("VehiclePhotoService", () => {
  let service: InstanceType<typeof VehiclePhotoServiceClass>;
  let vehicleRepository: InstanceType<typeof VehicleRepoClass>;

  beforeEach(() => {
    rawDb.exec("DELETE FROM vehicle_photos; DELETE FROM vehicles;");
    vehicleRepository = new DatabaseVehicleRepository("biz_test");
    service = new VehiclePhotoService(
      new DatabaseVehiclePhotoRepository(),
      vehicleRepository
    );
  });

  it("returns VEHICLE_NOT_FOUND when listing photos for a missing vehicle", async () => {
    const result = await service.listPhotos("does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
  });

  it("returns VEHICLE_NOT_FOUND when uploading to a missing vehicle", async () => {
    const result = await service.uploadPhotos("does-not-exist", [
      { fileName: "a.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VEHICLE_NOT_FOUND");
  });

  it("uploads a valid image and persists it", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "SV-0001");
    const result = await service.uploadPhotos(vehicle.id, [
      { fileName: "front.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ok).toBe(true);
    }

    const listed = await service.listPhotos(vehicle.id);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.data).toHaveLength(1);
  });

  it("rejects a file whose content doesn't match an accepted image type", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "SV-0002");
    const notAnImage = Buffer.from("this is not an image", "utf-8");

    const result = await service.uploadPhotos(vehicle.id, [
      { fileName: "fake.jpg", buffer: notAnImage, size: notAnImage.length },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].ok).toBe(false);
    }
    const listed = await service.listPhotos(vehicle.id);
    if (listed.ok) expect(listed.data).toHaveLength(0);
  });

  it("rejects an oversized file", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "SV-0003");
    const oversized = Buffer.concat([
      JPEG_HEADER,
      Buffer.alloc(6 * 1024 * 1024), // 6MB, over the 5MB limit
    ]);

    const result = await service.uploadPhotos(vehicle.id, [
      { fileName: "huge.jpg", buffer: oversized, size: oversized.length },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].ok).toBe(false);
      if (!result.data[0].ok) {
        expect(result.data[0].error).toMatch(/exceeds/i);
      }
    }
  });

  it("rejects an empty file", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "SV-0004");
    const result = await service.uploadPhotos(vehicle.id, [
      { fileName: "empty.jpg", buffer: Buffer.alloc(0), size: 0 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].ok).toBe(false);
  });

  it("enforces the maximum photo count per vehicle", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "SV-0005");
    const files = Array.from({ length: 11 }, (_, i) => ({
      fileName: `photo-${i}.jpg`,
      buffer: JPEG_HEADER,
      size: JPEG_HEADER.length,
    }));

    const result = await service.uploadPhotos(vehicle.id, files);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const succeeded = result.data.filter((o) => o.ok);
      const failed = result.data.filter((o) => !o.ok);
      expect(succeeded).toHaveLength(10); // MAX_PHOTOS_PER_VEHICLE
      expect(failed).toHaveLength(1);
      if (!failed[0].ok) expect(failed[0].error).toMatch(/maximum/i);
    }
  });

  it("removePhoto returns PHOTO_NOT_FOUND for a missing photo", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "SV-0006");
    const result = await service.removePhoto(vehicle.id, "does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PHOTO_NOT_FOUND");
  });

  it("removePhoto deletes the file from disk as well as the DB row", async () => {
    const vehicle = await createTestVehicle(vehicleRepository, "SV-0007");
    const uploadResult = await service.uploadPhotos(vehicle.id, [
      { fileName: "a.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length },
    ]);
    if (!uploadResult.ok || !uploadResult.data[0].ok) {
      throw new Error("setup failed");
    }
    const photoId = uploadResult.data[0].photo.id;

    const result = await service.removePhoto(vehicle.id, photoId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(0);
  });

  it("setPrimaryPhoto rejects a photo id belonging to a different vehicle", async () => {
    const vehicleA = await createTestVehicle(vehicleRepository, "SV-0008");
    const vehicleB = await createTestVehicle(vehicleRepository, "SV-0009");
    const uploadResult = await service.uploadPhotos(vehicleA.id, [
      { fileName: "a.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length },
    ]);
    if (!uploadResult.ok || !uploadResult.data[0].ok) {
      throw new Error("setup failed");
    }

    const result = await service.setPrimaryPhoto(
      vehicleB.id,
      uploadResult.data[0].photo.id
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PHOTO_NOT_FOUND");
  });
});

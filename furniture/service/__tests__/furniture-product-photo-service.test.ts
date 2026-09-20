import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { FurnitureProductPhotoService as PhotoServiceClass } from "../furniture-product-photo-service";
import type { DatabaseFurnitureProductPhotoRepository as PhotoRepoClass } from "../../repository/database-furniture-product-photo-repository";
import type { DatabaseFurnitureProductRepository as ProductRepoClass } from "../../repository/database-furniture-product-repository";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const dbDir = mkdtempSync(path.join(tmpdir(), "atlas-furniture-photo-service-db-"));
const storageDir = mkdtempSync(path.join(tmpdir(), "atlas-furniture-photo-service-storage-"));
const testDbPath = path.join(dbDir, "test.db");

let FurnitureProductPhotoService: typeof PhotoServiceClass;
let DatabaseFurnitureProductPhotoRepository: typeof PhotoRepoClass;
let DatabaseFurnitureProductRepository: typeof ProductRepoClass;
let rawDb: Database.Database;

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const BUSINESS_ID = "biz_test_furniture_photos";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;
  process.env.FURNITURE_PHOTO_STORAGE_DIR = storageDir;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  setupDb
    .prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, 'furniture', ?, ?)")
    .run(BUSINESS_ID, "Test Furniture Business", now, now);
  setupDb.close();

  const serviceModule = await import("../furniture-product-photo-service");
  const photoRepoModule = await import("../../repository/database-furniture-product-photo-repository");
  const productRepoModule = await import("../../repository/database-furniture-product-repository");
  FurnitureProductPhotoService = serviceModule.FurnitureProductPhotoService;
  DatabaseFurnitureProductPhotoRepository = photoRepoModule.DatabaseFurnitureProductPhotoRepository;
  DatabaseFurnitureProductRepository = productRepoModule.DatabaseFurnitureProductRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(storageDir, { recursive: true, force: true });
});

beforeEach(() => {
  rawDb.exec("DELETE FROM furniture_product_photos; DELETE FROM furniture_products;");
});

function getService() {
  return new FurnitureProductPhotoService(new DatabaseFurnitureProductPhotoRepository(), new DatabaseFurnitureProductRepository(BUSINESS_ID));
}

async function createProduct() {
  const repo = new DatabaseFurnitureProductRepository(BUSINESS_ID);
  return repo.create({
    name: "Test Sofa",
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

describe("FurnitureProductPhotoService.uploadPhotos", () => {
  it("uploads a valid JPEG and marks it primary (first photo)", async () => {
    const product = await createProduct();
    const result = await getService().uploadPhotos(product.id, [{ fileName: "a.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].ok).toBe(true);
    if (result.data[0].ok) expect(result.data[0].photo.isPrimary).toBe(true);
  });

  it("rejects a file that isn't actually an image (magic-byte sniffing, not trusting the extension)", async () => {
    const product = await createProduct();
    const fakeImage = Buffer.from("not an image, just text pretending to be one");
    const result = await getService().uploadPhotos(product.id, [{ fileName: "fake.jpg", buffer: fakeImage, size: fakeImage.length }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].ok).toBe(false);
  });

  it("rejects an empty file", async () => {
    const product = await createProduct();
    const result = await getService().uploadPhotos(product.id, [{ fileName: "empty.jpg", buffer: Buffer.alloc(0), size: 0 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].ok).toBe(false);
  });

  it("rejects a file over the size limit", async () => {
    const product = await createProduct();
    const oversized = Buffer.concat([JPEG_HEADER, Buffer.alloc(6 * 1024 * 1024)]);
    const result = await getService().uploadPhotos(product.id, [{ fileName: "huge.jpg", buffer: oversized, size: oversized.length }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].ok).toBe(false);
  });

  it("fails with PRODUCT_NOT_FOUND for a nonexistent product", async () => {
    const result = await getService().uploadPhotos("does-not-exist", [{ fileName: "a.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("caps uploads at MAX_PHOTOS_PER_PRODUCT", async () => {
    const product = await createProduct();
    const service = getService();
    const files = Array.from({ length: 12 }, (_, i) => ({ fileName: `${i}.jpg`, buffer: JPEG_HEADER, size: JPEG_HEADER.length }));
    const result = await service.uploadPhotos(product.id, files);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const succeeded = result.data.filter((o) => o.ok);
    expect(succeeded).toHaveLength(10);
  });
});

describe("FurnitureProductPhotoService — ownership", () => {
  it("removePhoto fails with PHOTO_NOT_FOUND for a photo belonging to a different product", async () => {
    const productA = await createProduct();
    const productB = await createProduct();
    const service = getService();

    const uploadResult = await service.uploadPhotos(productA.id, [{ fileName: "a.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length }]);
    expect(uploadResult.ok).toBe(true);
    if (!uploadResult.ok || !uploadResult.data[0].ok) return;
    const photoId = uploadResult.data[0].photo.id;

    const removeResult = await service.removePhoto(productB.id, photoId);
    expect(removeResult.ok).toBe(false);
    if (removeResult.ok) return;
    expect(removeResult.error.code).toBe("PHOTO_NOT_FOUND");
  });

  it("setPrimaryPhoto fails for a photo belonging to a different product", async () => {
    const productA = await createProduct();
    const productB = await createProduct();
    const service = getService();

    const uploadResult = await service.uploadPhotos(productA.id, [{ fileName: "a.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length }]);
    if (!uploadResult.ok || !uploadResult.data[0].ok) throw new Error("setup failed");
    const photoId = uploadResult.data[0].photo.id;

    const result = await service.setPrimaryPhoto(productB.id, photoId);
    expect(result.ok).toBe(false);
  });
});

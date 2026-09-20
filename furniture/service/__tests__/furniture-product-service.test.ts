import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { FurnitureProductService as ServiceClass } from "../furniture-product-service";
import type { FurnitureProductPhotoService as PhotoServiceClass } from "../furniture-product-photo-service";
import type { DatabaseFurnitureProductRepository as ProductRepoClass } from "../../repository/database-furniture-product-repository";
import type { DatabaseFurnitureProductPhotoRepository as PhotoRepoClass } from "../../repository/database-furniture-product-photo-repository";
import type { CreateFurnitureProductInput } from "../../domain/furniture-product-input";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const dbDir = mkdtempSync(path.join(tmpdir(), "atlas-furniture-product-service-db-"));
const storageDir = mkdtempSync(path.join(tmpdir(), "atlas-furniture-product-service-storage-"));
const testDbPath = path.join(dbDir, "test.db");

let FurnitureProductService: typeof ServiceClass;
let FurnitureProductPhotoService: typeof PhotoServiceClass;
let DatabaseFurnitureProductRepository: typeof ProductRepoClass;
let DatabaseFurnitureProductPhotoRepository: typeof PhotoRepoClass;
let rawDb: Database.Database;

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const BUSINESS_ID = "biz_test_furniture_service";

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

  FurnitureProductService = (await import("../furniture-product-service")).FurnitureProductService;
  FurnitureProductPhotoService = (await import("../furniture-product-photo-service")).FurnitureProductPhotoService;
  DatabaseFurnitureProductRepository = (await import("../../repository/database-furniture-product-repository")).DatabaseFurnitureProductRepository;
  DatabaseFurnitureProductPhotoRepository = (await import("../../repository/database-furniture-product-photo-repository"))
    .DatabaseFurnitureProductPhotoRepository;

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
  return new FurnitureProductService(
    new DatabaseFurnitureProductRepository(BUSINESS_ID),
    new DatabaseFurnitureProductPhotoRepository()
  );
}

function validInput(overrides: Partial<CreateFurnitureProductInput> = {}): CreateFurnitureProductInput {
  return {
    name: "Test Sofa",
    description: "",
    category: "sofas",
    price: 50000,
    currency: "KES",
    condition: "new",
    status: "available",
    material: null,
    color: null,
    dimensions: null,
    sku: null,
    ...overrides,
  };
}

describe("createProductWithinLimit", () => {
  it("rejects invalid input before touching the repository", async () => {
    const result = await getService().createProductWithinLimit(validInput({ name: "" }), 10);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.fieldErrors?.name).toBeDefined();
  });

  it("creates successfully under the limit", async () => {
    const result = await getService().createProductWithinLimit(validInput(), 10);
    expect(result.ok).toBe(true);
  });

  it("fails with LIMIT_EXCEEDED once the limit is reached", async () => {
    const service = getService();
    await service.createProductWithinLimit(validInput({ name: "First" }), 1);
    const result = await service.createProductWithinLimit(validInput({ name: "Second" }), 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LIMIT_EXCEEDED");
  });
});

describe("updateProductStatus", () => {
  it("applies a valid transition", async () => {
    const service = getService();
    const created = await service.createProductWithinLimit(validInput({ status: "available" }), null);
    if (!created.ok) throw new Error("setup failed");

    const result = await service.updateProductStatus(created.data.id, "reserved");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("reserved");
  });

  it("rejects an invalid transition (sold -> reserved)", async () => {
    const service = getService();
    const created = await service.createProductWithinLimit(validInput({ status: "sold" }), null);
    if (!created.ok) throw new Error("setup failed");

    const result = await service.updateProductStatus(created.data.id, "reserved");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("fails with NOT_FOUND for a nonexistent product", async () => {
    const result = await getService().updateProductStatus("does-not-exist", "sold");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("deleteProduct", () => {
  it("deletes the product and its photo files", async () => {
    const service = getService();
    const photoService = new FurnitureProductPhotoService(
      new DatabaseFurnitureProductPhotoRepository(),
      new DatabaseFurnitureProductRepository(BUSINESS_ID)
    );

    const created = await service.createProductWithinLimit(validInput(), null);
    if (!created.ok) throw new Error("setup failed");

    await photoService.uploadPhotos(created.data.id, [{ fileName: "a.jpg", buffer: JPEG_HEADER, size: JPEG_HEADER.length }]);

    const result = await service.deleteProduct(created.data.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.mediaCleanupFailures).toBe(0);

    expect(await new DatabaseFurnitureProductRepository(BUSINESS_ID).getById(created.data.id)).toBeNull();

    // Cascading delete (schema.ts's ON DELETE CASCADE) removes the photo rows too.
    const remainingPhotos = rawDb
      .prepare("SELECT * FROM furniture_product_photos WHERE furniture_product_id = ?")
      .all(created.data.id);
    expect(remainingPhotos).toHaveLength(0);
  });

  it("fails with NOT_FOUND for a nonexistent product", async () => {
    const result = await getService().deleteProduct("does-not-exist");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

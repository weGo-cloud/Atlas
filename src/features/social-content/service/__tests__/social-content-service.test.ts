import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-social-content-db-"));
const testDbPath = path.join(testDir, "test.db");
const vehiclePhotoDir = mkdtempSync(path.join(tmpdir(), "atlas-social-veh-photos-"));
const furniturePhotoDir = mkdtempSync(path.join(tmpdir(), "atlas-social-furn-photos-"));
const socialPostDir = mkdtempSync(path.join(tmpdir(), "atlas-social-posts-"));

const BUSINESS_A = "biz_social_a";
const BUSINESS_B = "biz_social_b";

let SocialContentService: typeof import("../social-content-service").SocialContentService;
let DatabaseSocialPostRepository: typeof import("../../repository/database-social-post-repository").DatabaseSocialPostRepository;
let saveVehiclePhoto: typeof import("@/lib/storage/vehicle-photo-storage").saveVehiclePhoto;
let saveFurniturePhoto: typeof import("@/lib/storage/furniture-photo-storage").saveFurniturePhoto;
let rawDb: Database.Database;

function makePngBytes(): Buffer {
  const png = new PNG({ width: 20, height: 20 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 200;
    png.data[i + 1] = 100;
    png.data[i + 2] = 50;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;
  process.env.VEHICLE_PHOTO_STORAGE_DIR = vehiclePhotoDir;
  process.env.FURNITURE_PHOTO_STORAGE_DIR = furniturePhotoDir;
  process.env.SOCIAL_POST_STORAGE_DIR = socialPostDir;
  delete process.env.ANTHROPIC_API_KEY; // deterministic template-fallback captions, no network

  const setupDb = new Database(testDbPath);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    setupDb.exec(readFileSync(path.join(migrationsDir, file), "utf-8").replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  for (const [id, vertical] of [[BUSINESS_A, "auto"], [BUSINESS_B, "auto"]] as const) {
    setupDb.prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, `Test ${id}`, vertical, now, now);
  }
  setupDb.close();

  // Registers the marketing feature's per-vertical item adapters AND this feature's photo ports/resolvers as a side effect.
  await import("../../../marketing/service/index");
  await import("../index");
  SocialContentService = (await import("../social-content-service")).SocialContentService;
  DatabaseSocialPostRepository = (await import("../../repository/database-social-post-repository")).DatabaseSocialPostRepository;
  saveVehiclePhoto = (await import("@/lib/storage/vehicle-photo-storage")).saveVehiclePhoto;
  saveFurniturePhoto = (await import("@/lib/storage/furniture-photo-storage")).saveFurniturePhoto;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  for (const dir of [testDir, vehiclePhotoDir, furniturePhotoDir, socialPostDir]) rmSync(dir, { recursive: true, force: true });
});

let vehicleCounter = 0;
function seedVehicle(businessId: string, overrides: Partial<{ price: number; status: string }> = {}): string {
  vehicleCounter += 1;
  const id = `veh_sc_${vehicleCounter}`;
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO vehicles (id, business_id, make, model, year, stock_id, mileage, price, status, description, added_at, updated_at)
       VALUES (?, ?, 'Toyota', 'Vitz', 2021, ?, 45000, ?, ?, 'Well maintained.', ?, ?)`
    )
    .run(id, businessId, id, overrides.price ?? 1800000, overrides.status ?? "available", now, now);
  return id;
}

let furnitureCounter = 0;
function seedFurniture(businessId: string): string {
  furnitureCounter += 1;
  const id = `furn_sc_${furnitureCounter}`;
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO furniture_products (id, business_id, name, description, category, price, currency, condition, status, material, color, dimensions, sku, added_at, updated_at)
       VALUES (?, ?, 'Test Sofa', 'A comfortable sofa.', 'sofas', 68000, 'KES', 'new', 'available', 'Fabric', 'Grey', '210x90x85cm', NULL, ?, ?)`
    )
    .run(id, businessId, now, now);
  return id;
}

async function seedVehiclePhoto(vehicleId: string): Promise<string> {
  const saved = await saveVehiclePhoto({ vehicleId, buffer: makePngBytes(), mimeType: "image/png" });
  const now = new Date().toISOString();
  rawDb
    .prepare("INSERT INTO vehicle_photos (id, vehicle_id, url, position, is_primary, created_at) VALUES (?, ?, ?, 0, 1, ?)")
    .run(`vph_${vehicleId}`, vehicleId, saved.url, now);
  return saved.url;
}

async function seedFurniturePhoto(productId: string): Promise<string> {
  const saved = await saveFurniturePhoto({ furnitureProductId: productId, buffer: makePngBytes(), mimeType: "image/png" });
  const now = new Date().toISOString();
  rawDb
    .prepare("INSERT INTO furniture_product_photos (id, furniture_product_id, url, position, is_primary, created_at) VALUES (?, ?, ?, 0, 1, ?)")
    .run(`fph_${productId}`, productId, saved.url, now);
  return saved.url;
}

function getService(businessId: string) {
  return new SocialContentService(new DatabaseSocialPostRepository(businessId), businessId);
}

describe("SocialContentService.generate — real photo, grounded caption, real render", () => {
  it("produces an approved-ready post from a real vehicle photo, using the item's real grounded facts", async () => {
    const vehicleId = seedVehicle(BUSINESS_A, { price: 1800000 });
    const photoUrl = await seedVehiclePhoto(vehicleId);

    const result = await getService(BUSINESS_A).generate({ itemType: "vehicle", itemId: vehicleId, templateId: "featured_item", photoUrl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.status).toBe("draft");
    expect(result.data.photoUrl).toBe(photoUrl);
    expect(result.data.caption.length).toBeGreaterThan(0);
    // The caption must come from the same grounded pipeline as marketing — it must mention the real price, never a fabricated one.
    expect(result.data.caption).toContain("1,800,000");
    expect(result.data.imageUrl).toMatch(/^\/uploads\/social-posts\//);

    // The image file referenced by imageUrl is a real, valid PNG on disk.
    const filename = result.data.imageUrl.split("/").pop()!;
    const { resolveSocialPostImagePath } = await import("@/lib/storage/social-post-storage");
    const diskPath = resolveSocialPostImagePath(BUSINESS_A, filename);
    expect(diskPath).toBeTruthy();
    const bytes = readFileSync(diskPath!);
    expect(PNG.sync.read(bytes).width).toBe(1080);
  });

  it("works identically for the furniture vertical through the same service", async () => {
    const productId = seedFurniture(BUSINESS_A);
    const photoUrl = await seedFurniturePhoto(productId);
    const result = await getService(BUSINESS_A).generate({ itemType: "furniture_product", itemId: productId, templateId: "specs_card", photoUrl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.caption).toContain("68,000");
    }
  });

  it("refuses a photo URL that isn't actually one of the item's own real photos", async () => {
    const vehicleId = seedVehicle(BUSINESS_A);
    const otherVehicleId = seedVehicle(BUSINESS_A);
    const otherPhotoUrl = await seedVehiclePhoto(otherVehicleId);

    const result = await getService(BUSINESS_A).generate({ itemType: "vehicle", itemId: vehicleId, templateId: "featured_item", photoUrl: otherPhotoUrl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PHOTO_NOT_FOUND");
  });

  it("never lets business A generate a post using business B's vehicle photo (tenant isolation)", async () => {
    const vehicleB = seedVehicle(BUSINESS_B);
    const photoB = await seedVehiclePhoto(vehicleB);

    const result = await getService(BUSINESS_A).generate({ itemType: "vehicle", itemId: vehicleB, templateId: "featured_item", photoUrl: photoB });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PHOTO_NOT_FOUND");

    // And business B's own service can see it fine — proves the failure above is isolation, not a general bug.
    const own = await getService(BUSINESS_B).generate({ itemType: "vehicle", itemId: vehicleB, templateId: "featured_item", photoUrl: photoB });
    expect(own.ok).toBe(true);
  });

  it("business A can never see or delete business B's generated posts", async () => {
    const vehicleB = seedVehicle(BUSINESS_B);
    const photoB = await seedVehiclePhoto(vehicleB);
    const created = await getService(BUSINESS_B).generate({ itemType: "vehicle", itemId: vehicleB, templateId: "featured_item", photoUrl: photoB });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await getService(BUSINESS_A).getById(created.data.id)).toBeNull();
    expect(await getService(BUSINESS_A).delete(created.data.id)).toBe(false);
    expect((await getService(BUSINESS_B).getById(created.data.id))?.id).toBe(created.data.id);
  });
});

describe("SocialContentService.updateCaption / approve", () => {
  it("edits the caption while a draft, then locks it once approved", async () => {
    const vehicleId = seedVehicle(BUSINESS_A);
    const photoUrl = await seedVehiclePhoto(vehicleId);
    const service = getService(BUSINESS_A);
    const created = await service.generate({ itemType: "vehicle", itemId: vehicleId, templateId: "featured_item", photoUrl });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const edited = await service.updateCaption(created.data.id, "A hand-edited caption.");
    expect(edited.ok).toBe(true);
    if (edited.ok) expect(edited.data.caption).toBe("A hand-edited caption.");

    const approved = await service.approve(created.data.id);
    expect(approved.ok).toBe(true);
    if (approved.ok) {
      expect(approved.data.status).toBe("approved");
      expect(approved.data.approvedAt).toBeTruthy();
    }

    const blockedEdit = await service.updateCaption(created.data.id, "Trying to edit after approval.");
    expect(blockedEdit.ok).toBe(false);
    if (!blockedEdit.ok) expect(blockedEdit.error.code).toBe("ALREADY_APPROVED");
  });

  it("rejects an empty caption", async () => {
    const vehicleId = seedVehicle(BUSINESS_A);
    const photoUrl = await seedVehiclePhoto(vehicleId);
    const service = getService(BUSINESS_A);
    const created = await service.generate({ itemType: "vehicle", itemId: vehicleId, templateId: "featured_item", photoUrl });
    if (!created.ok) return;
    const result = await service.updateCaption(created.data.id, "   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("a double-approve race only lets one call actually succeed (atomic conditional update)", async () => {
    const vehicleId = seedVehicle(BUSINESS_A);
    const photoUrl = await seedVehiclePhoto(vehicleId);
    const service = getService(BUSINESS_A);
    const created = await service.generate({ itemType: "vehicle", itemId: vehicleId, templateId: "featured_item", photoUrl });
    if (!created.ok) return;

    const [first, second] = await Promise.all([service.approve(created.data.id), service.approve(created.data.id)]);
    const outcomes = [first, second];
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
    expect(outcomes.filter((r) => !r.ok)).toHaveLength(1);
  });
});

describe("SocialContentService.list", () => {
  it("lists newest-first, scoped to the business, filterable by status", async () => {
    // A dedicated business, isolated from the posts other tests in this file create under BUSINESS_A/BUSINESS_B.
    const businessId = "biz_social_list_only";
    const now = new Date().toISOString();
    rawDb.prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, 'auto', ?, ?)").run(businessId, "List Test Business", now, now);

    const vehicleId = seedVehicle(businessId);
    const photoUrl = await seedVehiclePhoto(vehicleId);
    const service = getService(businessId);
    const first = await service.generate({ itemType: "vehicle", itemId: vehicleId, templateId: "featured_item", photoUrl });
    const second = await service.generate({ itemType: "vehicle", itemId: vehicleId, templateId: "price_highlight", photoUrl });
    if (!first.ok || !second.ok) return;
    await service.approve(second.data.id);

    const all = await service.list();
    expect(all.map((p) => p.id)).toEqual([second.data.id, first.data.id]);

    const approvedOnly = await service.list({ status: "approved" });
    expect(approvedOnly.map((p) => p.id)).toEqual([second.data.id]);
  });
});

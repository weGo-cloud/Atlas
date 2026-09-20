import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseFurnitureProductRepository as RepoClass } from "../database-furniture-product-repository";
import type { CreateFurnitureProductInput } from "../../domain/furniture-product-input";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../lib/db/migrations");
const testDir = mkdtempSync(path.join(tmpdir(), "atlas-furniture-db-"));
const testDbPath = path.join(testDir, "test.db");

let DatabaseFurnitureProductRepository: typeof RepoClass;
let rawDb: Database.Database;

const BUSINESS_A = "biz_furniture_a";
const BUSINESS_B = "biz_furniture_b";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const setupDb = new Database(testDbPath);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    setupDb.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  for (const id of [BUSINESS_A, BUSINESS_B]) {
    setupDb
      .prepare("INSERT INTO businesses (id, name, vertical, created_at, updated_at) VALUES (?, ?, 'furniture', ?, ?)")
      .run(id, `Business ${id}`, now, now);
  }
  setupDb.close();

  const repoModule = await import("../database-furniture-product-repository");
  DatabaseFurnitureProductRepository = repoModule.DatabaseFurnitureProductRepository;

  rawDb = new Database(testDbPath);
});

afterAll(() => {
  rawDb.close();
  rmSync(testDir, { recursive: true, force: true });
});

function validInput(overrides: Partial<CreateFurnitureProductInput> = {}): CreateFurnitureProductInput {
  return {
    name: "Test Sofa",
    description: "A test sofa.",
    category: "sofas",
    price: 50000,
    currency: "KES",
    condition: "new",
    status: "available",
    material: "Fabric",
    color: "Grey",
    dimensions: "200cm x 90cm x 85cm",
    sku: null,
    ...overrides,
  };
}

beforeEach(() => {
  rawDb.exec("DELETE FROM leads; DELETE FROM furniture_product_photos; DELETE FROM furniture_products;");
});

describe("DatabaseFurnitureProductRepository — CRUD", () => {
  it("creates and reads back a product", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const created = await repo.create(validInput({ name: "Oak Dining Table" }));
    expect(created.name).toBe("Oak Dining Table");
    expect(created.businessId).toBe(BUSINESS_A);

    const fetched = await repo.getById(created.id);
    expect(fetched).toEqual(created);
  });

  it("updates a product", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const created = await repo.create(validInput());
    const updated = await repo.update(created.id, { price: 60000, status: "reserved" });
    expect(updated?.price).toBe(60000);
    expect(updated?.status).toBe("reserved");
    expect(updated?.name).toBe(created.name); // untouched fields survive a partial update
  });

  it("returns null when updating a nonexistent product", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    expect(await repo.update("does-not-exist", { price: 1 })).toBeNull();
  });

  it("deletes a product", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const created = await repo.create(validInput());
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.getById(created.id)).toBeNull();
  });

  it("delete returns false for a nonexistent product", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    expect(await repo.delete("does-not-exist")).toBe(false);
  });

  it("counts by status", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    await repo.create(validInput({ status: "available" }));
    await repo.create(validInput({ status: "available" }));
    await repo.create(validInput({ status: "sold" }));
    const counts = await repo.countByStatus();
    expect(counts).toEqual({ available: 2, reserved: 0, sold: 1 });
  });

  it("filters by category, condition, status, and price range", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    await repo.create(validInput({ name: "Cheap sofa", category: "sofas", price: 10000, condition: "used" }));
    await repo.create(validInput({ name: "Pricey bed", category: "beds", price: 90000, condition: "new" }));

    const sofasOnly = await repo.listPaged({ category: "sofas" });
    expect(sofasOnly.items.map((p) => p.name)).toEqual(["Cheap sofa"]);

    const affordable = await repo.listPaged({ maxPrice: 20000 });
    expect(affordable.items.map((p) => p.name)).toEqual(["Cheap sofa"]);

    const usedOnly = await repo.listPaged({ condition: "used" });
    expect(usedOnly.items.map((p) => p.name)).toEqual(["Cheap sofa"]);
  });

  it("paginates results", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    for (let i = 0; i < 5; i++) {
      await repo.create(validInput({ name: `Item ${i}` }));
    }
    const page1 = await repo.listPaged({ page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(3);
  });

  it("lists distinct categories", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    await repo.create(validInput({ category: "sofas" }));
    await repo.create(validInput({ category: "beds" }));
    await repo.create(validInput({ category: "sofas" }));
    const categories = await repo.listDistinctCategories();
    expect(categories.sort()).toEqual(["beds", "sofas"]);
  });
});

/** Mission 030, Section 18 — critical multi-tenant isolation, same pattern as vehicle-business-isolation.test.ts. */
describe("Cross-business furniture product isolation (Mission 030, Section 18 — critical)", () => {
  it("business B cannot read business A's product by id", async () => {
    const repoA = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const repoB = new DatabaseFurnitureProductRepository(BUSINESS_B);

    const productA = await repoA.create(validInput({ name: "A's Sofa" }));
    expect(await repoB.getById(productA.id)).toBeNull();
  });

  it("business B's list never includes business A's products", async () => {
    const repoA = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const repoB = new DatabaseFurnitureProductRepository(BUSINESS_B);

    await repoA.create(validInput({ name: "A's Sofa" }));
    await repoB.create(validInput({ name: "B's Bed", category: "beds" }));

    const listB = await repoB.list();
    expect(listB.map((p) => p.name)).toEqual(["B's Bed"]);
  });

  it("business B cannot update business A's product (silently no-ops, returns null)", async () => {
    const repoA = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const repoB = new DatabaseFurnitureProductRepository(BUSINESS_B);

    const productA = await repoA.create(validInput({ name: "A's Sofa" }));
    const result = await repoB.update(productA.id, { price: 1 });
    expect(result).toBeNull();

    const stillIntact = await repoA.getById(productA.id);
    expect(stillIntact?.price).toBe(50000);
  });

  it("business B cannot delete business A's product", async () => {
    const repoA = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const repoB = new DatabaseFurnitureProductRepository(BUSINESS_B);

    const productA = await repoA.create(validInput({ name: "A's Sofa" }));
    expect(await repoB.delete(productA.id)).toBe(false);
    expect(await repoA.getById(productA.id)).not.toBeNull();
  });

  it("business A's countByStatus never includes business B's products", async () => {
    const repoA = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const repoB = new DatabaseFurnitureProductRepository(BUSINESS_B);

    await repoA.create(validInput({ status: "available" }));
    await repoB.create(validInput({ status: "available" }));
    await repoB.create(validInput({ status: "available" }));

    const countsA = await repoA.countByStatus();
    expect(countsA.available).toBe(1);
  });
});

/** Mission 030, Section 14/22 #18 — the same transactional limit guard M029 added to vehicles, applied to furniture from day one. */
describe("createWithinLimit — concurrent creation race", () => {
  it("creates when under the limit", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const result = await repo.createWithinLimit(validInput({ name: "Item" }), 5);
    expect(result.limitExceeded).toBe(false);
    expect(result.product?.name).toBe("Item");
  });

  it("rejects once the limit is reached, without creating a row", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    await repo.createWithinLimit(validInput({ name: "First" }), 1);
    const second = await repo.createWithinLimit(validInput({ name: "Second" }), 1);
    expect(second.limitExceeded).toBe(true);
    expect(second.product).toBeNull();

    const all = await repo.list();
    expect(all.map((p) => p.name)).toEqual(["First"]);
  });

  it("N concurrent calls at limit=1 create at most 1 product", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) => repo.createWithinLimit(validInput({ name: `Race ${i}` }), 1))
    );
    const succeeded = attempts.filter((a) => !a.limitExceeded);
    expect(succeeded).toHaveLength(1);

    const all = await repo.list();
    expect(all).toHaveLength(1);
  });

  it("null limit means unlimited", async () => {
    const repo = new DatabaseFurnitureProductRepository(BUSINESS_A);
    for (let i = 0; i < 3; i++) {
      const result = await repo.createWithinLimit(validInput({ name: `Item ${i}` }), null);
      expect(result.limitExceeded).toBe(false);
    }
  });
});

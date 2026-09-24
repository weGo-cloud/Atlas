import { and, asc, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { furnitureProducts, type FurnitureProductRow } from "@/lib/db/schema";
import type { FurnitureCategory, FurnitureProduct, FurnitureStatus } from "../domain/furniture-product";
import type { CreateFurnitureProductInput, UpdateFurnitureProductInput } from "../domain/furniture-product-input";
import {
  normalizeFurniturePagination,
  type FurnitureQuery,
  type FurnitureSortOption,
  type PaginatedFurnitureResult,
} from "../domain/furniture-product-query";
import type { FurnitureProductRepository } from "./furniture-product-repository";

/**
 * SQLite-backed implementation of FurnitureProductRepository, via
 * Drizzle ORM — mirrors DatabaseVehicleRepository's shape and
 * business-scoping discipline exactly (every query ANDs on
 * businessId; create() always stamps businessId from the constructor,
 * never from caller input).
 */
export class DatabaseFurnitureProductRepository implements FurnitureProductRepository {
  constructor(private readonly businessId: string) {}

  private get ownedByBusiness(): SQL {
    return eq(furnitureProducts.businessId, this.businessId);
  }

  async list(): Promise<FurnitureProduct[]> {
    const rows = await db.select().from(furnitureProducts).where(this.ownedByBusiness);
    return rows.map(toFurnitureProduct);
  }

  async listPaged(query: FurnitureQuery): Promise<PaginatedFurnitureResult<FurnitureProduct>> {
    const { page, pageSize } = normalizeFurniturePagination(query);
    const whereClause = and(this.ownedByBusiness, buildWhereClause(query));
    const orderBy = buildOrderBy(query.sort);
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db.select().from(furnitureProducts).where(whereClause).orderBy(orderBy).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(furnitureProducts).where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      items: rows.map(toFurnitureProduct),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(id: string): Promise<FurnitureProduct | null> {
    const rows = await db
      .select()
      .from(furnitureProducts)
      .where(and(eq(furnitureProducts.id, id), this.ownedByBusiness))
      .limit(1);
    return rows[0] ? toFurnitureProduct(rows[0]) : null;
  }

  async getByIds(ids: string[]): Promise<FurnitureProduct[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(furnitureProducts)
      .where(and(inArray(furnitureProducts.id, ids), this.ownedByBusiness));
    return rows.map(toFurnitureProduct);
  }

  async create(input: CreateFurnitureProductInput): Promise<FurnitureProduct> {
    const now = new Date().toISOString();
    const id = generateId();

    await db.insert(furnitureProducts).values({
      id,
      businessId: this.businessId,
      name: input.name,
      description: input.description,
      category: input.category,
      price: input.price,
      currency: input.currency,
      condition: input.condition,
      status: input.status,
      material: input.material,
      color: input.color,
      dimensions: input.dimensions,
      sku: input.sku,
      addedAt: now,
      updatedAt: now,
    });

    const created = await this.getById(id);
    if (!created) {
      throw new Error("Failed to read back newly created furniture product.");
    }
    return created;
  }

  /**
   * Mission 030 — same synchronous-transaction guard as
   * DatabaseVehicleRepository.createWithinLimit (Mission 029, Section
   * 14): the count-read and the insert happen inside one
   * `db.transaction()` callback, with no `await` between them, so
   * nothing else can run on this single-threaded process until it
   * returns. Furniture ships with this from the start rather than the
   * two-step check-then-insert sequence Auto had before Mission 029.
   */
  async createWithinLimit(
    input: CreateFurnitureProductInput,
    limit: number | null
  ): Promise<{ product: FurnitureProduct | null; currentCount: number; limitExceeded: boolean }> {
    const businessId = this.businessId;

    const result = db.transaction((tx) => {
      const rows = tx
        .select({ status: furnitureProducts.status, count: sql<number>`count(*)` })
        .from(furnitureProducts)
        .where(eq(furnitureProducts.businessId, businessId))
        .groupBy(furnitureProducts.status)
        .all();

      let currentCount = 0;
      for (const row of rows) currentCount += row.count;

      if (limit !== null && currentCount >= limit) {
        return { id: null as string | null, currentCount };
      }

      const now = new Date().toISOString();
      const id = generateId();
      tx.insert(furnitureProducts)
        .values({
          id,
          businessId,
          name: input.name,
          description: input.description,
          category: input.category,
          price: input.price,
          currency: input.currency,
          condition: input.condition,
          status: input.status,
          material: input.material,
          color: input.color,
          dimensions: input.dimensions,
          sku: input.sku,
          addedAt: now,
          updatedAt: now,
        })
        .run();

      return { id, currentCount: currentCount + 1 };
    });

    if (!result.id) {
      return { product: null, currentCount: result.currentCount, limitExceeded: true };
    }
    const product = await this.getById(result.id);
    return { product, currentCount: result.currentCount, limitExceeded: false };
  }

  async update(id: string, input: UpdateFurnitureProductInput): Promise<FurnitureProduct | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updatedAt = new Date().toISOString();

    await db
      .update(furnitureProducts)
      .set({ ...toUpdateRowValues(input), updatedAt })
      .where(and(eq(furnitureProducts.id, id), this.ownedByBusiness));

    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(furnitureProducts)
      .where(and(eq(furnitureProducts.id, id), this.ownedByBusiness));
    return result.changes > 0;
  }

  async countByStatus(): Promise<Record<FurnitureStatus, number>> {
    const rows = await db
      .select({ status: furnitureProducts.status, count: sql<number>`count(*)` })
      .from(furnitureProducts)
      .where(this.ownedByBusiness)
      .groupBy(furnitureProducts.status);

    const counts: Record<FurnitureStatus, number> = { available: 0, reserved: 0, sold: 0 };
    for (const row of rows) {
      counts[row.status as FurnitureStatus] = row.count;
    }
    return counts;
  }

  async listDistinctCategories(): Promise<FurnitureCategory[]> {
    const rows = await db
      .selectDistinct({ category: furnitureProducts.category })
      .from(furnitureProducts)
      .where(this.ownedByBusiness)
      .orderBy(asc(furnitureProducts.category));
    return rows.map((row) => row.category as FurnitureCategory);
  }
}

function toUpdateRowValues(input: UpdateFurnitureProductInput) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.price !== undefined ? { price: input.price } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.condition !== undefined ? { condition: input.condition } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.material !== undefined ? { material: input.material } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.dimensions !== undefined ? { dimensions: input.dimensions } : {}),
    ...(input.sku !== undefined ? { sku: input.sku } : {}),
  };
}

function buildWhereClause(query: FurnitureQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status) conditions.push(eq(furnitureProducts.status, query.status));
  if (query.category) conditions.push(eq(furnitureProducts.category, query.category));
  if (query.condition) conditions.push(eq(furnitureProducts.condition, query.condition));
  if (query.minPrice != null) conditions.push(gte(furnitureProducts.price, query.minPrice));
  if (query.maxPrice != null) conditions.push(lte(furnitureProducts.price, query.maxPrice));

  if (query.search && query.search.trim() !== "") {
    const term = `%${query.search.trim()}%`;
    const searchCondition = or(like(furnitureProducts.name, term), like(furnitureProducts.description, term));
    if (searchCondition) conditions.push(searchCondition);
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

function buildOrderBy(sort?: FurnitureSortOption) {
  switch (sort) {
    case "oldest":
      return asc(furnitureProducts.addedAt);
    case "price-asc":
      return asc(furnitureProducts.price);
    case "price-desc":
      return desc(furnitureProducts.price);
    case "newest":
    default:
      return desc(furnitureProducts.addedAt);
  }
}

function toFurnitureProduct(row: FurnitureProductRow): FurnitureProduct {
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    description: row.description,
    category: row.category as FurnitureCategory,
    price: row.price,
    currency: row.currency,
    condition: row.condition as FurnitureProduct["condition"],
    status: row.status as FurnitureStatus,
    material: row.material,
    color: row.color,
    dimensions: row.dimensions,
    sku: row.sku,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `furn_${Date.now().toString(36)}${counter.toString(36)}`;
}

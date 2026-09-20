import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sales, type SaleRow } from "@/lib/db/schema";
import type { Sale } from "../domain/sale";
import { normalizeSalePagination, type SaleFilter, type SaleQuery, type PaginatedSaleResult } from "../domain/sale-query";
import type { CreateSaleRecord, SaleRepository } from "./sale-repository";

/**
 * Thrown when an insert collides with the unique index on `dealId`
 * (see schema.ts's `sales` table comment) — the actual enforcement of
 * "one Deal → one Sale" (Mission 019, Section 2).
 */
export class DuplicateSaleError extends Error {
  constructor() {
    super("A sale already exists for this deal.");
    this.name = "DuplicateSaleError";
  }
}

/**
 * Thrown when an insert collides with the unique index on `vehicleId`
 * — the actual enforcement of "one Vehicle → at most one completed
 * Sale" (Mission 019, Section 7), including the concurrent case
 * (Scenario B): two completed Deals racing to create a Sale against
 * the same vehicle.
 */
export class VehicleAlreadySoldError extends Error {
  constructor() {
    super("This vehicle already has a completed sale.");
    this.name = "VehicleAlreadySoldError";
  }
}

function isUniqueConstraintViolation(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

/** Mission 019 — scoped to a single business at construction time, same pattern as every other repository in Atlas. */
export class DatabaseSaleRepository implements SaleRepository {
  constructor(private readonly businessId: string) {}

  private get ownedByBusiness(): SQL {
    return eq(sales.businessId, this.businessId);
  }

  async createSale(input: CreateSaleRecord): Promise<Sale> {
    const now = new Date().toISOString();
    const id = generateId();

    try {
      await db.insert(sales).values({
        id,
        businessId: this.businessId,
        dealId: input.dealId,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        vehicleLabel: input.vehicleLabel,
        saleAmount: input.saleAmount,
        soldAt: now,
        notes: input.notes ?? "",
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        if (error.message.includes("sales.deal_id")) throw new DuplicateSaleError();
        if (error.message.includes("sales.vehicle_id")) throw new VehicleAlreadySoldError();
      }
      throw error;
    }

    const created = await this.getSaleById(id);
    if (!created) {
      throw new Error("Failed to read back newly created sale.");
    }
    return created;
  }

  async getSaleById(id: string): Promise<Sale | null> {
    const rows = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), this.ownedByBusiness))
      .limit(1);
    return rows[0] ? toSale(rows[0]) : null;
  }

  async getSales(filter?: SaleFilter): Promise<Sale[]> {
    const whereClause = and(this.ownedByBusiness, buildWhereClause(filter));
    const rows = await db.select().from(sales).where(whereClause).orderBy(desc(sales.soldAt));
    return rows.map(toSale);
  }

  async getSalesPaged(query: SaleQuery): Promise<PaginatedSaleResult<Sale>> {
    const { page, pageSize } = normalizeSalePagination(query);
    const whereClause = and(this.ownedByBusiness, buildWhereClause(query));
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db.select().from(sales).where(whereClause).orderBy(desc(sales.soldAt)).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(sales).where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      items: rows.map(toSale),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getSaleForDeal(dealId: string): Promise<Sale | null> {
    const rows = await db
      .select()
      .from(sales)
      .where(and(eq(sales.dealId, dealId), this.ownedByBusiness))
      .limit(1);
    return rows[0] ? toSale(rows[0]) : null;
  }

  async getSalesForCustomer(customerId: string): Promise<Sale[]> {
    const rows = await db
      .select()
      .from(sales)
      .where(and(eq(sales.customerId, customerId), this.ownedByBusiness))
      .orderBy(desc(sales.soldAt));
    return rows.map(toSale);
  }

  async getSalesForVehicle(vehicleId: string): Promise<Sale[]> {
    const rows = await db
      .select()
      .from(sales)
      .where(and(eq(sales.vehicleId, vehicleId), this.ownedByBusiness))
      .orderBy(desc(sales.soldAt));
    return rows.map(toSale);
  }
}

function buildWhereClause(filter?: SaleFilter): SQL | undefined {
  if (!filter) return undefined;

  const conditions: SQL[] = [];
  if (filter.customerId) conditions.push(eq(sales.customerId, filter.customerId));
  if (filter.vehicleId) conditions.push(eq(sales.vehicleId, filter.vehicleId));
  if (filter.dealId) conditions.push(eq(sales.dealId, filter.dealId));
  if (filter.soldFrom) conditions.push(gte(sales.soldAt, filter.soldFrom));
  if (filter.soldTo) conditions.push(lte(sales.soldAt, filter.soldTo));

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

export function toSale(row: SaleRow): Sale {
  return {
    id: row.id,
    businessId: row.businessId as string,
    dealId: row.dealId,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    vehicleLabel: row.vehicleLabel,
    saleAmount: row.saleAmount,
    soldAt: row.soldAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `sale_${Date.now().toString(36)}${counter.toString(36)}`;
}

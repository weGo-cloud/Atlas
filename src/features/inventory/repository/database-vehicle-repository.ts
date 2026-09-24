import { and, asc, desc, eq, gte, inArray, isNull, like, lte, ne, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leads, vehicles, type VehicleRow } from "@/lib/db/schema";
import { LEAD_ACTIVE_STATUSES } from "../../leads/domain/lead";
import type { Vehicle, VehicleStatus } from "../data/types";
import type { CreateVehicleInput, UpdateVehicleInput } from "../domain/vehicle-input";
import {
  normalizePagination,
  type PaginatedResult,
  type VehicleQuery,
  type VehicleSortOption,
} from "../domain/vehicle-query";
import type { VehicleRepository } from "./vehicle-repository";

/**
 * SQLite-backed implementation of VehicleRepository (via Drizzle ORM).
 * Conforms to the same interface as MockVehicleRepository — the
 * service layer above it is unaware which one is wired in.
 *
 * Mission 012: scoped to a single business at construction time.
 * Every query below ANDs on businessId — there is no method that
 * reads or writes a vehicle without that filter, and create() always
 * stamps businessId from `this.businessId`, never from caller input,
 * so there's no field for a client to manipulate into a cross-business
 * write. This is the enforcement boundary Phase 7 calls "critical" —
 * it lives here, not in the UI.
 */
export class DatabaseVehicleRepository implements VehicleRepository {
  constructor(private readonly businessId: string) {}

  private get ownedByBusiness(): SQL {
    return eq(vehicles.businessId, this.businessId);
  }

  async list(): Promise<Vehicle[]> {
    const rows = await db.select().from(vehicles).where(this.ownedByBusiness);
    return rows.map(toVehicle);
  }

  async listPaged(query: VehicleQuery): Promise<PaginatedResult<Vehicle>> {
    const { page, pageSize } = normalizePagination(query);
    const whereClause = and(this.ownedByBusiness, buildWhereClause(query));
    const orderBy = buildOrderBy(query.sort);
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(vehicles)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(vehicles)
        .where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      items: rows.map(toVehicle),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(id: string): Promise<Vehicle | null> {
    const rows = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), this.ownedByBusiness))
      .limit(1);
    return rows[0] ? toVehicle(rows[0]) : null;
  }

  async getByIds(ids: string[]): Promise<Vehicle[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(vehicles)
      .where(and(inArray(vehicles.id, ids), this.ownedByBusiness));
    return rows.map(toVehicle);
  }

  async findByStockId(stockId: string): Promise<Vehicle | null> {
    // Case-insensitive match done at the database via lower() rather
    // than loading the whole table into JS just to compare strings —
    // the issue Mission 008 fixed (this used to be a full table scan
    // in application memory). Stock ID uniqueness is scoped per
    // business at the application layer (the DB column itself is
    // globally unique — see note in schema.ts's original comment;
    // that remains a Mission 008 decision this mission doesn't revisit).
    const normalized = stockId.trim().toLowerCase();
    const rows = await db
      .select()
      .from(vehicles)
      .where(and(sql`lower(${vehicles.stockId}) = ${normalized}`, this.ownedByBusiness))
      .limit(1);
    return rows[0] ? toVehicle(rows[0]) : null;
  }

  async create(input: CreateVehicleInput): Promise<Vehicle> {
    const now = new Date().toISOString();
    const id = generateId();

    await db.insert(vehicles).values({
      id,
      businessId: this.businessId,
      stockId: input.stockId,
      make: input.make,
      model: input.model,
      year: input.year,
      mileage: input.mileage,
      price: input.price,
      status: input.status,
      description: input.description,
      addedAt: now,
      updatedAt: now,
    });

    const created = await this.getById(id);
    if (!created) {
      // Should be unreachable — the insert above either succeeds or
      // throws — but keeps the return type honest without a `!`.
      throw new Error("Failed to read back newly created vehicle.");
    }
    return created;
  }

  /**
   * Mission 029, Section 14 — the count-read and the insert happen
   * inside a single `db.transaction()` callback, and — critically —
   * that callback is a plain synchronous function using `tx`'s
   * `.all()`/`.get()`/`.run()` calls rather than `await`ed query
   * builders. better-sqlite3 is a synchronous driver; drizzle's
   * transaction() for it delegates straight to better-sqlite3's own
   * native `Database.transaction()`, which only guarantees atomicity
   * for a callback that runs start-to-finish without yielding to the
   * event loop. An `await` between the count and the insert (which is
   * exactly what the old two-step
   * countByStatus-then-checkLimit-then-create sequence in
   * createVehicleAction did) lets Node switch to another concurrent
   * request's handler in between, which is the actual race — two
   * requests can both read "49 of 50" before either has written its
   * insert. A fully synchronous transaction body closes that window:
   * nothing else can run on this single-threaded process until it
   * returns.
   */
  async createWithinLimit(
    input: CreateVehicleInput,
    limit: number | null
  ): Promise<{ vehicle: Vehicle | null; currentCount: number; limitExceeded: boolean }> {
    const businessId = this.businessId;

    const result = db.transaction((tx) => {
      const rows = tx
        .select({ status: vehicles.status, count: sql<number>`count(*)` })
        .from(vehicles)
        .where(eq(vehicles.businessId, businessId))
        .groupBy(vehicles.status)
        .all();

      let currentCount = 0;
      for (const row of rows) currentCount += row.count;

      if (limit !== null && currentCount >= limit) {
        return { id: null as string | null, currentCount };
      }

      const now = new Date().toISOString();
      const id = generateId();
      tx.insert(vehicles)
        .values({
          id,
          businessId,
          stockId: input.stockId,
          make: input.make,
          model: input.model,
          year: input.year,
          mileage: input.mileage,
          price: input.price,
          status: input.status,
          description: input.description,
          addedAt: now,
          updatedAt: now,
        })
        .run();

      return { id, currentCount: currentCount + 1 };
    });

    if (!result.id) {
      return { vehicle: null, currentCount: result.currentCount, limitExceeded: true };
    }
    const vehicle = await this.getById(result.id);
    return { vehicle, currentCount: result.currentCount, limitExceeded: false };
  }

  async update(
    id: string,
    input: UpdateVehicleInput
  ): Promise<Vehicle | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updatedAt = new Date().toISOString();

    await db
      .update(vehicles)
      .set({ ...input, updatedAt })
      .where(and(eq(vehicles.id, id), this.ownedByBusiness));

    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(vehicles)
      .where(and(eq(vehicles.id, id), this.ownedByBusiness));
    return result.changes > 0;
  }

  async countByStatus(): Promise<Record<VehicleStatus, number>> {
    const rows = await db
      .select({ status: vehicles.status, count: sql<number>`count(*)` })
      .from(vehicles)
      .where(this.ownedByBusiness)
      .groupBy(vehicles.status);

    const counts: Record<VehicleStatus, number> = {
      available: 0,
      reserved: 0,
      sold: 0,
    };
    for (const row of rows) {
      counts[row.status as VehicleStatus] = row.count;
    }
    return counts;
  }

  async listDistinctMakes(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ make: vehicles.make })
      .from(vehicles)
      .where(this.ownedByBusiness)
      .orderBy(asc(vehicles.make));
    return rows.map((row) => row.make);
  }

  /**
   * Single aggregate query (COUNT + SUM in one pass) over non-sold
   * vehicles. Average is computed in JS from that same total/count
   * pair rather than via SQL AVG() — avoids a second aggregate
   * expression and keeps the rounding behavior (whole KSh, no
   * fractional currency units in this domain) explicit and
   * predictable rather than dependent on SQLite's float handling.
   */
  async getActiveInventoryValueStats(): Promise<{
    activeCount: number;
    totalValue: number;
    averagePrice: number;
  }> {
    const rows = await db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${vehicles.price}), 0)`,
      })
      .from(vehicles)
      .where(and(ne(vehicles.status, "sold"), this.ownedByBusiness));

    const activeCount = rows[0]?.count ?? 0;
    const totalValue = rows[0]?.total ?? 0;
    const averagePrice =
      activeCount > 0 ? Math.round(totalValue / activeCount) : 0;

    return { activeCount, totalValue, averagePrice };
  }

  async countAddedSince(sinceIso: string): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(vehicles)
      .where(and(gte(vehicles.addedAt, sinceIso), this.ownedByBusiness));
    return rows[0]?.count ?? 0;
  }

  async countByMake(limit: number): Promise<{ make: string; count: number }[]> {
    const rows = await db
      .select({ make: vehicles.make, count: sql<number>`count(*)` })
      .from(vehicles)
      .where(this.ownedByBusiness)
      .groupBy(vehicles.make)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    return rows;
  }

  /** Mission 026 — see interface doc. Fetches only `addedAt` (never a full row scan) and computes age in TypeScript for a single, simple, testable unit of arithmetic rather than duplicating date math in SQL. */
  async getAvailableVehicleAgeDays(now: string): Promise<number[]> {
    const rows = await db
      .select({ addedAt: vehicles.addedAt })
      .from(vehicles)
      .where(and(this.ownedByBusiness, eq(vehicles.status, "available")));

    const nowMs = new Date(now).getTime();
    const ages = rows.map((row) => (nowMs - new Date(row.addedAt).getTime()) / (24 * 60 * 60 * 1000));
    return ages.sort((a, b) => b - a);
  }

  /** Mission 026 — see interface doc. */
  async getStaleAvailableVehicles(minAgeDays: number, now: string, limit: number): Promise<Vehicle[]> {
    const cutoff = new Date(new Date(now).getTime() - minAgeDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = await db
      .select()
      .from(vehicles)
      .where(and(this.ownedByBusiness, eq(vehicles.status, "available"), lte(vehicles.addedAt, cutoff)))
      .orderBy(asc(vehicles.addedAt))
      .limit(limit);
    return rows.map(toVehicle);
  }

  /**
   * Mission 027 — see interface doc. Single LEFT JOIN against `leads`,
   * matched on vehicleId AND leads.businessId = vehicles.businessId
   * (not just vehicleId) so a lead that's been manipulated into
   * referencing a vehicle it doesn't actually share a business with
   * (Section 14's explicit inconsistent-state scenario) can never
   * suppress a signal by accident — the join condition itself enforces
   * the same business-scoping boundary every other query here does.
   * Filtered to LEAD_ACTIVE_STATUSES only, so `won`/`lost` leads never
   * count as "active interest" (Section 4/8). Rows where a matching
   * active lead exists have a non-null `leads.id` and are excluded by
   * `isNull(leads.id)` — one query, no N+1.
   */
  private get noActiveLeadJoin(): SQL {
    return and(
      eq(leads.vehicleId, vehicles.id),
      eq(leads.businessId, vehicles.businessId),
      inArray(leads.status, [...LEAD_ACTIVE_STATUSES])
    )!;
  }

  /** Mission 027 — see interface doc. */
  async getAvailableVehicleAgeDaysWithoutActiveLead(now: string): Promise<number[]> {
    const rows = await db
      .select({ addedAt: vehicles.addedAt })
      .from(vehicles)
      .leftJoin(leads, this.noActiveLeadJoin)
      .where(and(this.ownedByBusiness, eq(vehicles.status, "available"), isNull(leads.id)));

    const nowMs = new Date(now).getTime();
    const ages = rows.map((row) => (nowMs - new Date(row.addedAt).getTime()) / (24 * 60 * 60 * 1000));
    return ages.sort((a, b) => b - a);
  }

  /** Mission 027 — see interface doc. */
  async getStaleAvailableVehiclesWithoutActiveLead(minAgeDays: number, now: string, limit: number): Promise<Vehicle[]> {
    const cutoff = new Date(new Date(now).getTime() - minAgeDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = await db
      .select({ vehicle: vehicles })
      .from(vehicles)
      .leftJoin(leads, this.noActiveLeadJoin)
      .where(
        and(
          this.ownedByBusiness,
          eq(vehicles.status, "available"),
          lte(vehicles.addedAt, cutoff),
          isNull(leads.id)
        )
      )
      .orderBy(asc(vehicles.addedAt))
      .limit(limit);
    return rows.map((row) => toVehicle(row.vehicle));
  }
}

function buildWhereClause(query: VehicleQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status) conditions.push(eq(vehicles.status, query.status));
  if (query.make) conditions.push(eq(vehicles.make, query.make));
  if (query.model) conditions.push(eq(vehicles.model, query.model));
  if (query.minPrice != null) conditions.push(gte(vehicles.price, query.minPrice));
  if (query.maxPrice != null) conditions.push(lte(vehicles.price, query.maxPrice));
  if (query.minYear != null) conditions.push(gte(vehicles.year, query.minYear));
  if (query.maxYear != null) conditions.push(lte(vehicles.year, query.maxYear));

  if (query.search && query.search.trim() !== "") {
    // SQLite's LIKE is case-insensitive for ASCII by default, so no
    // explicit lower()ing is needed here.
    const term = `%${query.search.trim()}%`;
    const searchCondition = or(
      like(vehicles.stockId, term),
      like(vehicles.make, term),
      like(vehicles.model, term)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

function buildOrderBy(sort?: VehicleSortOption) {
  switch (sort) {
    case "oldest":
      return asc(vehicles.addedAt);
    case "price-asc":
      return asc(vehicles.price);
    case "price-desc":
      return desc(vehicles.price);
    case "year-desc":
      return desc(vehicles.year);
    case "newest":
    default:
      return desc(vehicles.addedAt);
  }
}

function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    // The column is nullable only for pre-backfill migration safety
    // (see schema.ts) — every row returned here was already filtered
    // by `WHERE business_id = ?`, so it can never actually be null.
    businessId: row.businessId as string,
    stockId: row.stockId,
    make: row.make,
    model: row.model,
    year: row.year,
    mileage: row.mileage,
    price: row.price,
    status: row.status as VehicleStatus,
    description: row.description,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  // Timestamp + monotonic counter keeps ids sortable and collision-free
  // within a process, without pulling in a uuid/cuid dependency for a
  // single call site. Seeded rows keep their original veh_NNN ids
  // (see prisma-style seed script) — this only shapes ids for vehicles
  // created after that point.
  counter += 1;
  return `veh_${Date.now().toString(36)}${counter.toString(36)}`;
}

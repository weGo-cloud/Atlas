import { and, desc, eq, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { deals, sales, type DealRow } from "@/lib/db/schema";
import type { Deal, DealStatus } from "../domain/deal";
import { DEAL_ACTIVE_STATUSES, DEAL_TERMINAL_STATUSES } from "../domain/deal";
import type { UpdateDealInput } from "../domain/deal-input";
import { normalizeDealPagination, type DealFilter, type DealQuery, type PaginatedDealResult } from "../domain/deal-query";
import type { CreateDealRecord, DealRepository } from "./deal-repository";

/**
 * Thrown when an insert collides with the partial unique index on
 * (leadId) for non-terminal statuses (see schema.ts's `deals` table
 * comment). DealService catches this and reports it the same way as
 * its own pre-insert duplicate-active-deal check — the DB constraint
 * is the actual concurrency guarantee; the service-level check is
 * just there to fail fast with a clean error in the common,
 * non-racing case.
 */
export class DuplicateActiveDealError extends Error {
  constructor() {
    super("An active deal already exists for this lead.");
    this.name = "DuplicateActiveDealError";
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

/** Mission 018: scoped to a single business at construction time — see database-lead-repository.ts for the full rationale, which applies identically here. */
export class DatabaseDealRepository implements DealRepository {
  constructor(private readonly businessId: string) {}

  private get ownedByBusiness(): SQL {
    return eq(deals.businessId, this.businessId);
  }

  async createDeal(input: CreateDealRecord): Promise<Deal> {
    const now = new Date().toISOString();
    const id = generateId();

    try {
      await db.insert(deals).values({
        id,
        businessId: this.businessId,
        customerId: input.customerId,
        leadId: input.leadId,
        vehicleId: input.vehicleId,
        vehicleLabel: input.vehicleLabel,
        status: "draft",
        agreedPrice: input.agreedPrice,
        depositAmount: input.depositAmount ?? null,
        notes: input.notes ?? "",
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateActiveDealError();
      }
      throw error;
    }

    const created = await this.getDealById(id);
    if (!created) {
      throw new Error("Failed to read back newly created deal.");
    }
    return created;
  }

  async getDealById(id: string): Promise<Deal | null> {
    const rows = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), this.ownedByBusiness))
      .limit(1);
    return rows[0] ? toDeal(rows[0]) : null;
  }

  async getDeals(filter?: DealFilter): Promise<Deal[]> {
    const whereClause = and(this.ownedByBusiness, buildWhereClause(filter));
    const rows = await db.select().from(deals).where(whereClause).orderBy(desc(deals.createdAt));
    return rows.map(toDeal);
  }

  async getDealsPaged(query: DealQuery): Promise<PaginatedDealResult<Deal>> {
    const { page, pageSize } = normalizeDealPagination(query);
    const whereClause = and(this.ownedByBusiness, buildWhereClause(query));
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(deals)
        .where(whereClause)
        .orderBy(desc(deals.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(deals).where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      items: rows.map(toDeal),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async updateDeal(id: string, input: UpdateDealInput): Promise<Deal | null> {
    const existing = await this.getDealById(id);
    if (!existing) return null;

    await db
      .update(deals)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(and(eq(deals.id, id), this.ownedByBusiness));

    return this.getDealById(id);
  }

  /**
   * Single conditional UPDATE keyed on both id and the caller's
   * expected current status — collapses read-modify-write into one
   * atomic statement, exactly like LeadRepository.completeFollowUp
   * (Mission 017). `changes === 0` means either the deal doesn't
   * exist/isn't ours, or its status no longer matches `expectedFrom`
   * (a concurrent transition already moved it) — DealService
   * distinguishes those cases with its own existence check.
   */
  async updateDealStatus(id: string, expectedFrom: DealStatus, to: DealStatus): Promise<Deal | null> {
    const now = new Date().toISOString();
    const result = await db
      .update(deals)
      .set({ status: to, updatedAt: now })
      .where(and(eq(deals.id, id), this.ownedByBusiness, eq(deals.status, expectedFrom)));

    if (result.changes === 0) {
      return null;
    }

    return this.getDealById(id);
  }

  async getDealsForCustomer(customerId: string): Promise<Deal[]> {
    const rows = await db
      .select()
      .from(deals)
      .where(and(eq(deals.customerId, customerId), this.ownedByBusiness))
      .orderBy(desc(deals.createdAt));
    return rows.map(toDeal);
  }

  async getDealsForLead(leadId: string): Promise<Deal[]> {
    const rows = await db
      .select()
      .from(deals)
      .where(and(eq(deals.leadId, leadId), this.ownedByBusiness))
      .orderBy(desc(deals.createdAt));
    return rows.map(toDeal);
  }

  async getDealsForVehicle(vehicleId: string): Promise<Deal[]> {
    const rows = await db
      .select()
      .from(deals)
      .where(and(eq(deals.vehicleId, vehicleId), this.ownedByBusiness))
      .orderBy(desc(deals.createdAt));
    return rows.map(toDeal);
  }

  async getActiveDealForLead(leadId: string): Promise<Deal | null> {
    const rows = await db
      .select()
      .from(deals)
      .where(
        and(
          eq(deals.leadId, leadId),
          this.ownedByBusiness,
          notInArray(deals.status, [...DEAL_TERMINAL_STATUSES])
        )
      )
      .limit(1);
    return rows[0] ? toDeal(rows[0]) : null;
  }

  /** Mission 022 — mirrors AnalyticsRepository.getIntegrityMetrics's join exactly (completed Deal, left-joined to Sale, no matching Sale row), returning the Deals themselves instead of just a count. */
  async getDealsAwaitingSale(limit: number): Promise<Deal[]> {
    const rows = await db
      .select({ deal: deals })
      .from(deals)
      .leftJoin(sales, eq(sales.dealId, deals.id))
      .where(and(this.ownedByBusiness, eq(deals.status, "completed"), isNull(sales.id)))
      .orderBy(desc(deals.updatedAt))
      .limit(limit);
    return rows.map((row) => toDeal(row.deal));
  }
}

function buildWhereClause(filter?: DealFilter): SQL | undefined {
  if (!filter) return undefined;

  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(deals.status, filter.status));
  if (filter.customerId) conditions.push(eq(deals.customerId, filter.customerId));
  if (filter.leadId) conditions.push(eq(deals.leadId, filter.leadId));
  if (filter.vehicleId) conditions.push(eq(deals.vehicleId, filter.vehicleId));
  if (filter.lifecycle === "active") {
    conditions.push(inArray(deals.status, [...DEAL_ACTIVE_STATUSES]));
  } else if (filter.lifecycle === "terminal") {
    conditions.push(inArray(deals.status, [...DEAL_TERMINAL_STATUSES]));
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

export function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    businessId: row.businessId as string,
    customerId: row.customerId,
    leadId: row.leadId,
    vehicleId: row.vehicleId,
    vehicleLabel: row.vehicleLabel,
    status: row.status as DealStatus,
    agreedPrice: row.agreedPrice,
    depositAmount: row.depositAmount,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `deal_${Date.now().toString(36)}${counter.toString(36)}`;
}

import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leads, type LeadRow } from "@/lib/db/schema";
import type { Lead, LeadStatus } from "../domain/lead";
import { LEAD_ACTIVE_STATUSES, LEAD_STATUSES, LEAD_TERMINAL_STATUSES } from "../domain/lead";
import type { CreateLeadInput, UpdateLeadInput } from "../domain/lead-input";
import { normalizeLeadPagination, type LeadFilter, type LeadQuery, type PaginatedLeadResult } from "../domain/lead-query";
import type { LeadRepository } from "./lead-repository";

/** Mission 012: scoped to a single business at construction time — see database-vehicle-repository.ts for the full rationale, which applies identically here. */
export class DatabaseLeadRepository implements LeadRepository {
  constructor(private readonly businessId: string) {}

  private get ownedByBusiness(): SQL {
    return eq(leads.businessId, this.businessId);
  }

  async createLead(input: CreateLeadInput): Promise<Lead> {
    const now = new Date().toISOString();
    const id = generateId();

    await db.insert(leads).values({
      id,
      businessId: this.businessId,
      customerId: input.customerId,
      vehicleId: input.vehicleId ?? null,
      vehicleLabel: input.vehicleLabel ?? null,
      furnitureProductId: input.furnitureProductId ?? null,
      furnitureProductLabel: input.furnitureProductLabel ?? null,
      status: input.status ?? "new",
      source: input.source ?? "",
      notes: input.notes ?? "",
      lastContactedAt: null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.getLeadById(id);
    if (!created) {
      throw new Error("Failed to read back newly created lead.");
    }
    return created;
  }

  async getLeadById(id: string): Promise<Lead | null> {
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), this.ownedByBusiness))
      .limit(1);
    return rows[0] ? toLead(rows[0]) : null;
  }

  async getLeads(filter?: LeadFilter): Promise<Lead[]> {
    const whereClause = and(this.ownedByBusiness, buildWhereClause(filter));
    const rows = await db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt));
    return rows.map(toLead);
  }

  async getLeadsPaged(query: LeadQuery): Promise<PaginatedLeadResult<Lead>> {
    const { page, pageSize } = normalizeLeadPagination(query);
    const whereClause = and(this.ownedByBusiness, buildWhereClause(query));
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(leads)
        .where(whereClause)
        .orderBy(desc(leads.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(leads).where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      items: rows.map(toLead),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async updateLead(id: string, input: UpdateLeadInput): Promise<Lead | null> {
    const existing = await this.getLeadById(id);
    if (!existing) return null;

    await db
      .update(leads)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(and(eq(leads.id, id), this.ownedByBusiness));

    return this.getLeadById(id);
  }

  async updateLeadStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    const existing = await this.getLeadById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    // Mission 015 — every successful status transition also stamps
    // lastContactedAt, since a status change is itself evidence of an
    // interaction with the lead. See the schema comment for why this
    // isn't client-settable.
    await db
      .update(leads)
      .set({ status, lastContactedAt: now, updatedAt: now })
      .where(and(eq(leads.id, id), this.ownedByBusiness));

    return this.getLeadById(id);
  }

  /**
   * Mission 017 fix — this used to be read-then-write (getLeadById to
   * check existence, then an unconditional UPDATE), which is a
   * classic TOCTOU race: two concurrent completeFollowUp calls could
   * both pass the "does it exist" read before either write ran, then
   * both would perform the (idempotent-at-the-row-level) UPDATE and
   * both would report success — two callers both believing *they*
   * completed the follow-up, and potentially two "follow_up_completed"
   * activities for one real event.
   *
   * Fixed by making completion itself the atomic precondition: the
   * UPDATE only touches a row that still has nextFollowUpAt set, and
   * `changes` tells us whether *this* call was the one that actually
   * flipped it. Whichever concurrent call's UPDATE statement commits
   * first wins that race and gets changes=1; every other call's
   * WHERE clause no longer matches (nextFollowUpAt is already null by
   * the time it runs) and gets changes=0 — read-modify-write collapsed
   * into one statement instead of two, so there's no gap for another
   * request to land in between.
   */
  async completeFollowUp(id: string): Promise<Lead | null> {
    const now = new Date().toISOString();
    const result = await db
      .update(leads)
      .set({ nextFollowUpAt: null, lastContactedAt: now, updatedAt: now })
      .where(and(eq(leads.id, id), this.ownedByBusiness, isNotNull(leads.nextFollowUpAt)));

    if (result.changes === 0) {
      // Either the lead doesn't exist/isn't ours, or a follow-up
      // wasn't scheduled — including "someone else's concurrent call
      // just completed it a moment ago". LeadService distinguishes
      // the first case from the rest with its own existence check;
      // this method just reports "nothing was completed here".
      return null;
    }

    return this.getLeadById(id);
  }

  async getLeadsForCustomer(customerId: string): Promise<Lead[]> {
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.customerId, customerId), this.ownedByBusiness))
      .orderBy(desc(leads.createdAt));
    return rows.map(toLead);
  }

  async getLeadsForVehicle(vehicleId: string): Promise<Lead[]> {
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.vehicleId, vehicleId), this.ownedByBusiness))
      .orderBy(desc(leads.createdAt));
    return rows.map(toLead);
  }

  async getLeadsForFurnitureProduct(furnitureProductId: string): Promise<Lead[]> {
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.furnitureProductId, furnitureProductId), this.ownedByBusiness))
      .orderBy(desc(leads.createdAt));
    return rows.map(toLead);
  }

  async getRecentLeads(limit: number): Promise<Lead[]> {
    const rows = await db
      .select()
      .from(leads)
      .where(this.ownedByBusiness)
      .orderBy(desc(leads.createdAt))
      .limit(limit);
    return rows.map(toLead);
  }

  async countByStatus(): Promise<Record<LeadStatus, number>> {
    const rows = await db
      .select({ status: leads.status, count: sql<number>`count(*)` })
      .from(leads)
      .where(this.ownedByBusiness)
      .groupBy(leads.status);

    const counts = Object.fromEntries(
      LEAD_STATUSES.map((status) => [status, 0])
    ) as Record<LeadStatus, number>;
    for (const row of rows) {
      counts[row.status as LeadStatus] = row.count;
    }
    return counts;
  }

  async countLeadsByVehicle(
    limit: number
  ): Promise<{ vehicleId: string; count: number }[]> {
    const rows = await db
      .select({
        vehicleId: leads.vehicleId,
        count: sql<number>`count(*)`,
      })
      .from(leads)
      .where(and(isNotNull(leads.vehicleId), this.ownedByBusiness))
      .groupBy(leads.vehicleId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    // vehicleId is guaranteed non-null by the isNotNull filter above;
    // the cast reflects that without weakening the column's nullable
    // type in the schema itself.
    return rows.map((row) => ({
      vehicleId: row.vehicleId as string,
      count: row.count,
    }));
  }

  /** Mission 022 — mirrors AnalyticsRepository.getFollowUpMetrics's overdue definition exactly (active status, nextFollowUpAt set and before the start of `now`'s local day), but returns the leads themselves, most-overdue-first, database-limited rather than a full active-lead scan. */
  async getOverdueFollowUpLeads(now: string, limit: number): Promise<Lead[]> {
    const nowDate = new Date(now);
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const todayStartIso = todayStart.toISOString();

    const rows = await db
      .select()
      .from(leads)
      .where(
        and(
          this.ownedByBusiness,
          inArray(leads.status, [...LEAD_ACTIVE_STATUSES]),
          isNotNull(leads.nextFollowUpAt),
          lt(leads.nextFollowUpAt, todayStartIso)
        )
      )
      .orderBy(asc(leads.nextFollowUpAt))
      .limit(limit);
    return rows.map(toLead);
  }

  /** Mission 022 — active leads created in [from, to), most recent first, database-limited. `from`/`to` null means open-ended, matching AnalyticsRepository's range convention. */
  async getActiveLeadsCreatedInRange(from: string | null, to: string | null, limit: number): Promise<Lead[]> {
    const conditions: SQL[] = [this.ownedByBusiness, inArray(leads.status, [...LEAD_ACTIVE_STATUSES])];
    if (from) conditions.push(gte(leads.createdAt, from));
    if (to) conditions.push(lt(leads.createdAt, to));

    const rows = await db
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(limit);
    return rows.map(toLead);
  }

  /** Mission 023 — see interface doc. No status filter, no limit — this is the training-time full cohort. */
  async getLeadsCreatedBefore(before: string): Promise<Lead[]> {
    const rows = await db
      .select()
      .from(leads)
      .where(and(this.ownedByBusiness, lte(leads.createdAt, before)))
      .orderBy(asc(leads.createdAt));
    return rows.map(toLead);
  }
}

function buildWhereClause(filter?: LeadFilter): SQL | undefined {
  if (!filter) return undefined;

  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(leads.status, filter.status));
  if (filter.customerId) conditions.push(eq(leads.customerId, filter.customerId));
  if (filter.vehicleId) conditions.push(eq(leads.vehicleId, filter.vehicleId));
  if (filter.lifecycle === "active") {
    conditions.push(inArray(leads.status, [...LEAD_ACTIVE_STATUSES]));
  } else if (filter.lifecycle === "terminal") {
    conditions.push(inArray(leads.status, [...LEAD_TERMINAL_STATUSES]));
  }
  if (filter.followUpDueBy) {
    // Only meaningful for leads that are both still active and have a
    // follow-up date set at all — a terminal or never-scheduled lead
    // shouldn't show up in a "needs follow-up" view.
    conditions.push(isNotNull(leads.nextFollowUpAt));
    conditions.push(lte(leads.nextFollowUpAt, filter.followUpDueBy));
    conditions.push(inArray(leads.status, [...LEAD_ACTIVE_STATUSES]));
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    businessId: row.businessId as string,
    customerId: row.customerId,
    vehicleId: row.vehicleId,
    vehicleLabel: row.vehicleLabel,
    furnitureProductId: row.furnitureProductId,
    furnitureProductLabel: row.furnitureProductLabel,
    status: row.status as LeadStatus,
    source: row.source,
    notes: row.notes,
    lastContactedAt: row.lastContactedAt,
    nextFollowUpAt: row.nextFollowUpAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `lead_${Date.now().toString(36)}${counter.toString(36)}`;
}

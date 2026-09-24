import { and, asc, desc, eq, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { activities, type ActivityRow } from "@/lib/db/schema";
import type { Activity, ActivityType } from "../domain/activity";
import type { CreateActivityInput } from "../domain/activity-input";
import {
  normalizeActivityPagination,
  type ActivityFilter,
  type ActivityQuery,
  type PaginatedActivityResult,
} from "../domain/activity-query";
import type { ActivityRepository } from "./activity-repository";

function toActivity(row: ActivityRow): Activity {
  let metadata: Activity["metadata"] = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      // Defensive only — every write goes through this same repository,
      // so malformed JSON should never actually happen. Surface as "no
      // metadata" rather than throwing and breaking an entire timeline
      // render over one unparseable row.
      metadata = null;
    }
  }

  return {
    id: row.id,
    businessId: row.businessId,
    customerId: row.customerId,
    leadId: row.leadId,
    userId: row.userId,
    type: row.type as ActivityType,
    content: row.content,
    metadata,
    createdAt: row.createdAt,
  };
}

function buildWhereClause(businessId: string, filter?: ActivityFilter): SQL {
  const conditions: SQL[] = [eq(activities.businessId, businessId)];
  if (filter?.customerId) conditions.push(eq(activities.customerId, filter.customerId));
  if (filter?.leadId) conditions.push(eq(activities.leadId, filter.leadId));
  return and(...conditions)!;
}

/** Mission 012-style: scoped to a single business at construction time — see database-vehicle-repository.ts for the full rationale. */
export class DatabaseActivityRepository implements ActivityRepository {
  constructor(private readonly businessId: string) {}

  async createActivity(input: CreateActivityInput): Promise<Activity> {
    const now = new Date().toISOString();
    const id = generateId();

    await db.insert(activities).values({
      id,
      businessId: this.businessId,
      customerId: input.customerId,
      leadId: input.leadId ?? null,
      userId: input.userId,
      type: input.type,
      content: input.content,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: now,
    });

    const created = await this.getActivityById(id);
    if (!created) {
      throw new Error("Failed to read back newly created activity.");
    }
    return created;
  }

  async getActivityById(id: string): Promise<Activity | null> {
    const rows = await db
      .select()
      .from(activities)
      .where(and(eq(activities.id, id), eq(activities.businessId, this.businessId)))
      .limit(1);
    const row = rows[0];
    return row ? toActivity(row) : null;
  }

  async getActivitiesPaged(query: ActivityQuery): Promise<PaginatedActivityResult<Activity>> {
    const { page, pageSize } = normalizeActivityPagination(query);
    const whereClause = buildWhereClause(this.businessId, query);
    const offset = (page - 1) * pageSize;

    // Secondary sort by id breaks same-millisecond ties: ids are
    // time-prefixed (see generateId below), so this is a real
    // chronological tiebreaker, not an arbitrary one.
    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(activities)
        .where(whereClause)
        .orderBy(desc(activities.createdAt), desc(activities.id))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(activities).where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      items: rows.map(toActivity),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Mission 023 — see interface doc. Ordered by leadId then createdAt then id, so a caller can group-by-lead and iterate each lead's events chronologically in one pass without re-sorting. */
  async getActivitiesForLeads(leadIds: string[], upTo: string): Promise<Activity[]> {
    if (leadIds.length === 0) return [];
    const rows = await db
      .select()
      .from(activities)
      .where(and(eq(activities.businessId, this.businessId), inArray(activities.leadId, leadIds), lte(activities.createdAt, upTo)))
      .orderBy(asc(activities.leadId), asc(activities.createdAt), asc(activities.id));
    return rows.map(toActivity);
  }
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `activity_${Date.now().toString(36)}${counter.toString(36)}`;
}

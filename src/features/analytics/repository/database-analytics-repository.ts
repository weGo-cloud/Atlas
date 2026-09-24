import { and, desc, eq, gte, inArray, isNull, lt, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { deals, leads, sales } from "@/lib/db/schema";
import { DEAL_ACTIVE_STATUSES, DEAL_STATUSES, type DealStatus } from "../../deals/domain/deal";
import { LEAD_ACTIVE_STATUSES, LEAD_STATUSES, type LeadStatus } from "../../leads/domain/lead";
import type { ResolvedDateRange } from "../domain/date-range";
import type {
  FollowUpMetrics,
  FunnelMetrics,
  IntegrityMetrics,
  SalesTrendBucket,
  SalesTrendPoint,
} from "../domain/metrics";
import type { AnalyticsRepository } from "./analytics-repository";

/** strftime format per bucket — see getSalesTrend. SQLite's strftime is deterministic and index-friendly enough for this volume; no app-side date-bucketing library is introduced (Section 7 — no premature infrastructure). */
const TREND_BUCKET_FORMAT: Record<SalesTrendBucket, string> = {
  day: "%Y-%m-%d",
  week: "%Y-%W",
  month: "%Y-%m",
};

/** Mission 020 — business-scoped at construction, same convention as every other repository in Atlas. */
export class DatabaseAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly businessId: string) {}

  async getLeadStatusCounts(range: ResolvedDateRange): Promise<Record<LeadStatus, number>> {
    const whereClause = and(
      eq(leads.businessId, this.businessId),
      ...rangeConditions(leads.createdAt, range)
    );

    const rows = await db
      .select({ status: leads.status, count: sql<number>`count(*)` })
      .from(leads)
      .where(whereClause)
      .groupBy(leads.status);

    const counts = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0])) as Record<
      LeadStatus,
      number
    >;
    for (const row of rows) counts[row.status as LeadStatus] = row.count;
    return counts;
  }

  async getDealStatusCounts(range: ResolvedDateRange): Promise<Record<DealStatus, number>> {
    const whereClause = and(
      eq(deals.businessId, this.businessId),
      ...rangeConditions(deals.createdAt, range)
    );

    const rows = await db
      .select({ status: deals.status, count: sql<number>`count(*)` })
      .from(deals)
      .where(whereClause)
      .groupBy(deals.status);

    const counts = Object.fromEntries(DEAL_STATUSES.map((status) => [status, 0])) as Record<
      DealStatus,
      number
    >;
    for (const row of rows) counts[row.status as DealStatus] = row.count;
    return counts;
  }

  async getActiveDealPipelineStats(
    range: ResolvedDateRange
  ): Promise<{ activeCount: number; pipelineValue: number }> {
    const whereClause = and(
      eq(deals.businessId, this.businessId),
      inArray(deals.status, [...DEAL_ACTIVE_STATUSES]),
      ...rangeConditions(deals.createdAt, range)
    );

    const rows = await db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${deals.agreedPrice}), 0)`,
      })
      .from(deals)
      .where(whereClause);

    return {
      activeCount: rows[0]?.count ?? 0,
      pipelineValue: rows[0]?.total ?? 0,
    };
  }

  async getSalesStats(
    range: ResolvedDateRange
  ): Promise<{ totalSales: number; grossSalesValue: number }> {
    const whereClause = and(
      eq(sales.businessId, this.businessId),
      ...rangeConditions(sales.soldAt, range)
    );

    const rows = await db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${sales.saleAmount}), 0)`,
      })
      .from(sales)
      .where(whereClause);

    return {
      totalSales: rows[0]?.count ?? 0,
      grossSalesValue: rows[0]?.total ?? 0,
    };
  }

  async getHighestValueSale(
    range: ResolvedDateRange
  ): Promise<{ id: string; saleAmount: number; vehicleLabel: string | null } | null> {
    const whereClause = and(
      eq(sales.businessId, this.businessId),
      ...rangeConditions(sales.soldAt, range)
    );

    const rows = await db
      .select({ id: sales.id, saleAmount: sales.saleAmount, vehicleLabel: sales.vehicleLabel })
      .from(sales)
      .where(whereClause)
      .orderBy(desc(sales.saleAmount))
      .limit(1);

    return rows[0] ?? null;
  }

  async getSalesTrend(range: ResolvedDateRange, bucket: SalesTrendBucket): Promise<SalesTrendPoint[]> {
    const format = TREND_BUCKET_FORMAT[bucket];
    const periodExpr = sql<string>`strftime(${format}, ${sales.soldAt})`;
    const whereClause = and(
      eq(sales.businessId, this.businessId),
      ...rangeConditions(sales.soldAt, range)
    );

    const rows = await db
      .select({
        period: periodExpr,
        // MIN(soldAt) gives a real ISO timestamp to anchor the bucket
        // to, rather than trying to reverse-parse strftime's output.
        periodStart: sql<string>`min(${sales.soldAt})`,
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${sales.saleAmount}), 0)`,
      })
      .from(sales)
      .where(whereClause)
      .groupBy(periodExpr)
      .orderBy(periodExpr);

    return rows.map((row) => ({
      periodStart: row.periodStart,
      periodLabel: formatPeriodLabel(row.periodStart, bucket),
      salesCount: row.count,
      grossValue: row.total,
    }));
  }

  async getFollowUpMetrics(now: string): Promise<FollowUpMetrics> {
    const nowDate = new Date(now);
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const todayStartIso = todayStart.toISOString();
    const tomorrowStartIso = tomorrowStart.toISOString();

    const activeLeadsClause = and(
      eq(leads.businessId, this.businessId),
      inArray(leads.status, [...LEAD_ACTIVE_STATUSES])
    );

    const rows = await db
      .select({
        overdue: sql<number>`sum(case when ${leads.nextFollowUpAt} is not null and ${leads.nextFollowUpAt} < ${todayStartIso} then 1 else 0 end)`,
        due: sql<number>`sum(case when ${leads.nextFollowUpAt} is not null and ${leads.nextFollowUpAt} >= ${todayStartIso} and ${leads.nextFollowUpAt} < ${tomorrowStartIso} then 1 else 0 end)`,
        upcoming: sql<number>`sum(case when ${leads.nextFollowUpAt} is not null and ${leads.nextFollowUpAt} >= ${tomorrowStartIso} then 1 else 0 end)`,
        withoutFollowUp: sql<number>`sum(case when ${leads.nextFollowUpAt} is null then 1 else 0 end)`,
      })
      .from(leads)
      .where(activeLeadsClause);

    return {
      overdueFollowUps: rows[0]?.overdue ?? 0,
      dueFollowUps: rows[0]?.due ?? 0,
      upcomingFollowUps: rows[0]?.upcoming ?? 0,
      activeLeadsWithoutFollowUp: rows[0]?.withoutFollowUp ?? 0,
    };
  }

  /**
   * One query for the lead-anchored stages (leads LEFT JOIN deals
   * LEFT JOIN sales), all counted as COUNT(DISTINCT leads.id) /
   * COUNT(DISTINCT CASE...) — never a plain row count — so a lead
   * with several historical Deals can't inflate a stage past the
   * number of distinct leads actually in it (Section 4). A second,
   * separate query anchors deal→sale conversion on Deal identity
   * instead, since that stage isn't lead-shaped.
   */
  async getFunnelMetrics(range: ResolvedDateRange): Promise<FunnelMetrics> {
    const leadWhereClause = and(
      eq(leads.businessId, this.businessId),
      ...rangeConditions(leads.createdAt, range)
    );

    const funnelRows = await db
      .select({
        totalLeads: sql<number>`count(distinct ${leads.id})`,
        leadsWithDeals: sql<number>`count(distinct case when ${deals.id} is not null then ${leads.id} end)`,
        leadsWithCompletedDeals: sql<number>`count(distinct case when ${deals.status} = 'completed' then ${leads.id} end)`,
        leadsWithSales: sql<number>`count(distinct case when ${sales.id} is not null then ${leads.id} end)`,
      })
      .from(leads)
      .leftJoin(deals, eq(deals.leadId, leads.id))
      .leftJoin(sales, eq(sales.dealId, deals.id))
      .where(leadWhereClause);

    const dealWhereClause = and(
      eq(deals.businessId, this.businessId),
      eq(deals.status, "completed"),
      ...rangeConditions(deals.createdAt, range)
    );

    const dealSaleRows = await db
      .select({
        completedDeals: sql<number>`count(distinct ${deals.id})`,
        completedDealsWithSale: sql<number>`count(distinct case when ${sales.id} is not null then ${deals.id} end)`,
      })
      .from(deals)
      .leftJoin(sales, eq(sales.dealId, deals.id))
      .where(dealWhereClause);

    const totalLeads = funnelRows[0]?.totalLeads ?? 0;
    const leadsWithDeals = funnelRows[0]?.leadsWithDeals ?? 0;
    const leadsWithCompletedDeals = funnelRows[0]?.leadsWithCompletedDeals ?? 0;
    const leadsWithSales = funnelRows[0]?.leadsWithSales ?? 0;
    const completedDealsInRange = dealSaleRows[0]?.completedDeals ?? 0;
    const completedDealsWithSaleInRange = dealSaleRows[0]?.completedDealsWithSale ?? 0;

    return {
      totalLeads,
      leadsWithDeals,
      leadsWithCompletedDeals,
      leadsWithSales,
      leadToDealRate: rate(leadsWithDeals, totalLeads),
      leadToCompletedDealRate: rate(leadsWithCompletedDeals, totalLeads),
      leadToSaleRate: rate(leadsWithSales, totalLeads),
      completedDealsInRange,
      completedDealsWithSaleInRange,
      dealToSaleRate: rate(completedDealsWithSaleInRange, completedDealsInRange),
    };
  }

  /**
   * Deliberately not date-ranged (see IntegrityMetrics) — a snapshot
   * of every completed Deal that still has no Sale record, right now.
   */
  async getIntegrityMetrics(): Promise<IntegrityMetrics> {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(deals)
      .leftJoin(sales, eq(sales.dealId, deals.id))
      .where(and(eq(deals.businessId, this.businessId), eq(deals.status, "completed"), isNull(sales.id)));

    return { completedDealsAwaitingSale: rows[0]?.count ?? 0 };
  }
}

function rangeConditions(column: AnyColumn, range: ResolvedDateRange): SQL[] {
  const conditions: SQL[] = [];
  if (range.from) conditions.push(gte(column, range.from));
  if (range.to) conditions.push(lt(column, range.to));
  return conditions;
}

/** Undefined (not 0) on a zero denominator — Section 4: never NaN/Infinity, never a misleading 0%. */
function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function formatPeriodLabel(periodStartIso: string, bucket: SalesTrendBucket): string {
  const date = new Date(periodStartIso);
  if (bucket === "month") {
    return date.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
  }
  if (bucket === "week") {
    return `Week of ${date.toLocaleDateString("en-KE", { day: "2-digit", month: "short" })}`;
  }
  return date.toLocaleDateString("en-KE", { day: "2-digit", month: "short" });
}

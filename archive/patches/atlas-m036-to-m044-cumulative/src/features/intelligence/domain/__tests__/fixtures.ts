import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { AnalyticsOverview } from "../../../analytics/domain/metrics";
import { buildIntelligenceContext } from "../context";
import type { IntelligenceContext } from "../context";

export const LAST_30_RANGE: ResolvedDateRange = {
  preset: "last30",
  from: "2026-08-03T00:00:00.000Z",
  to: "2026-09-02T00:00:00.000Z",
};

export const ALL_TIME_RANGE: ResolvedDateRange = { preset: "allTime", from: null, to: null };

/**
 * A fully "quiet" overview — every metric at a value that should
 * trigger no rule. Individual tests override just the fields their
 * rule cares about, so each test stays focused on one condition
 * instead of re-declaring the whole AnalyticsOverview shape.
 */
export function baseOverview(overrides: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  const base: AnalyticsOverview = {
    dateRange: LAST_30_RANGE,
    inventory: {
      totalVehicles: 3,
      availableVehicles: 2,
      reservedVehicles: 1,
      soldVehicles: 0,
      vehiclesByStatus: { available: 2, reserved: 1, sold: 0 },
      currentInventoryValue: 6_000_000,
      availableVehicleAgeDays: [10, 5],
      availableVehicleAgeDaysWithoutActiveLead: [],
    },
    crm: {
      totalCustomers: 5,
      totalLeads: 5,
      activeLeads: 2,
      leadsByStatus: { new: 1, contacted: 1, qualified: 0, negotiating: 0, won: 2, lost: 1 },
      wonLeads: 2,
      lostLeads: 1,
    },
    deals: {
      activeDeals: 1,
      completedDeals: 2,
      cancelledDeals: 0,
      dealsByStatus: { draft: 0, negotiating: 1, reserved: 0, completed: 2, cancelled: 0 },
      pipelineValue: 1_500_000,
      averageAgreedPrice: 1_500_000,
    },
    sales: {
      totalSales: 2,
      grossSalesValue: 3_000_000,
      averageSaleValue: 1_500_000,
      highestValueSale: { id: "sale_1", saleAmount: 1_600_000, vehicleLabel: "2021 Toyota Vitz" },
    },
    salesTrend: [],
    followUps: {
      dueFollowUps: 0,
      overdueFollowUps: 0,
      upcomingFollowUps: 1,
      activeLeadsWithoutFollowUp: 0,
    },
    funnel: {
      totalLeads: 5,
      leadsWithDeals: 3,
      leadsWithCompletedDeals: 2,
      leadsWithSales: 2,
      leadToDealRate: 0.6,
      leadToCompletedDealRate: 0.4,
      leadToSaleRate: 0.4,
      completedDealsInRange: 2,
      completedDealsWithSaleInRange: 2,
      dealToSaleRate: 1,
    },
    integrity: {
      completedDealsAwaitingSale: 0,
    },
  };

  return { ...base, ...overrides };
}

export function contextFrom(overrides: Partial<AnalyticsOverview> = {}): IntelligenceContext {
  return buildIntelligenceContext(baseOverview(overrides));
}

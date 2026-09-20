import type { VehicleRepository } from "../../inventory/repository/vehicle-repository";
import type { CustomerRepository } from "../../customers/repository/customer-repository";
import type { AnalyticsRepository } from "../repository/analytics-repository";
import { rangeSpanDays, type ResolvedDateRange } from "../domain/date-range";
import type {
  AnalyticsOverview,
  CrmMetrics,
  DealMetrics,
  InventoryMetrics,
  SalesMetrics,
  SalesTrendBucket,
  SalesTrendPoint,
} from "../domain/metrics";

/**
 * Mission 020 — Analytics' read-only composition layer.
 *
 * Depends on VehicleRepository/CustomerRepository directly for the
 * two metric groups that already have an authoritative, efficient
 * source (Section 1: consume existing domains, don't duplicate
 * them) — exactly the same "repositories over services" reasoning
 * DashboardService already established for read-only aggregates with
 * no business rules to apply. Everything else (deals, sales, funnel,
 * follow-ups, integrity) goes through the new AnalyticsRepository,
 * since no existing repository exposes those cross-table/date-ranged
 * aggregations.
 */
export class AnalyticsService {
  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly customerRepository: CustomerRepository
  ) {}

  /** Mission 026 threaded `now` through here — deterministic vehicle-age computation, never the real clock. */
  async getInventoryMetrics(now: string): Promise<InventoryMetrics> {
    const [counts, valueStats, availableVehicleAgeDays, availableVehicleAgeDaysWithoutActiveLead] = await Promise.all([
      this.vehicleRepository.countByStatus(),
      this.vehicleRepository.getActiveInventoryValueStats(),
      this.vehicleRepository.getAvailableVehicleAgeDays(now),
      // Mission 027 — cross-entity fact, one additional bounded query (a
      // single LEFT JOIN against leads inside VehicleRepository, no
      // N+1), parallelized with everything else here exactly like its
      // M026 sibling.
      this.vehicleRepository.getAvailableVehicleAgeDaysWithoutActiveLead(now),
    ]);

    return {
      totalVehicles: counts.available + counts.reserved + counts.sold,
      availableVehicles: counts.available,
      reservedVehicles: counts.reserved,
      soldVehicles: counts.sold,
      vehiclesByStatus: counts,
      currentInventoryValue: valueStats.totalValue,
      availableVehicleAgeDays,
      availableVehicleAgeDaysWithoutActiveLead,
    };
  }

  async getCrmMetrics(range: ResolvedDateRange): Promise<CrmMetrics> {
    const [totalCustomers, leadsByStatus] = await Promise.all([
      this.customerRepository.countCustomers(),
      this.analyticsRepository.getLeadStatusCounts(range),
    ]);

    const totalLeads = Object.values(leadsByStatus).reduce((sum, n) => sum + n, 0);
    const wonLeads = leadsByStatus.won;
    const lostLeads = leadsByStatus.lost;
    const activeLeads =
      leadsByStatus.new + leadsByStatus.contacted + leadsByStatus.qualified + leadsByStatus.negotiating;

    return { totalCustomers, totalLeads, activeLeads, leadsByStatus, wonLeads, lostLeads };
  }

  async getDealMetrics(range: ResolvedDateRange): Promise<DealMetrics> {
    const [dealsByStatus, pipelineStats] = await Promise.all([
      this.analyticsRepository.getDealStatusCounts(range),
      this.analyticsRepository.getActiveDealPipelineStats(range),
    ]);

    const activeDeals = dealsByStatus.draft + dealsByStatus.negotiating + dealsByStatus.reserved;

    return {
      activeDeals,
      completedDeals: dealsByStatus.completed,
      cancelledDeals: dealsByStatus.cancelled,
      dealsByStatus,
      pipelineValue: pipelineStats.pipelineValue,
      averageAgreedPrice:
        pipelineStats.activeCount > 0
          ? Math.round(pipelineStats.pipelineValue / pipelineStats.activeCount)
          : null,
    };
  }

  async getSalesMetrics(range: ResolvedDateRange): Promise<SalesMetrics> {
    const [stats, highestValueSale] = await Promise.all([
      this.analyticsRepository.getSalesStats(range),
      this.analyticsRepository.getHighestValueSale(range),
    ]);

    return {
      totalSales: stats.totalSales,
      grossSalesValue: stats.grossSalesValue,
      averageSaleValue:
        stats.totalSales > 0 ? Math.round(stats.grossSalesValue / stats.totalSales) : null,
      highestValueSale,
    };
  }

  async getSalesTrend(range: ResolvedDateRange): Promise<SalesTrendPoint[]> {
    return this.analyticsRepository.getSalesTrend(range, resolveTrendBucket(range));
  }

  /** Everything an Analytics page needs, fetched with maximal concurrency — one Promise.all, no N+1 across metric groups. */
  async getOverview(range: ResolvedDateRange, now: string = new Date().toISOString()): Promise<AnalyticsOverview> {
    const [inventory, crm, dealMetrics, sales, salesTrend, followUps, funnel, integrity] = await Promise.all([
      this.getInventoryMetrics(now),
      this.getCrmMetrics(range),
      this.getDealMetrics(range),
      this.getSalesMetrics(range),
      this.getSalesTrend(range),
      this.analyticsRepository.getFollowUpMetrics(now),
      this.analyticsRepository.getFunnelMetrics(range),
      this.analyticsRepository.getIntegrityMetrics(),
    ]);

    return { dateRange: range, inventory, crm, deals: dealMetrics, sales, salesTrend, followUps, funnel, integrity };
  }
}

/**
 * Section 8 — "sensible period grouping based on the selected range
 * without creating unnecessary complexity." A bounded range buckets
 * by its own span (short ranges get daily granularity, long ones get
 * coarser buckets so the trend stays readable); an open-ended range
 * (allTime, or an unbounded custom range) always buckets monthly,
 * since its span is unknown and could be arbitrarily long.
 */
function resolveTrendBucket(range: ResolvedDateRange): SalesTrendBucket {
  const spanDays = rangeSpanDays(range);
  if (spanDays === null) return "month";
  if (spanDays <= 31) return "day";
  if (spanDays <= 180) return "week";
  return "month";
}

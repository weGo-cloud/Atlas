import type { DealStatus } from "../../deals/domain/deal";
import type { LeadStatus } from "../../leads/domain/lead";
import type { ResolvedDateRange } from "../domain/date-range";
import type {
  FollowUpMetrics,
  FunnelMetrics,
  IntegrityMetrics,
  SalesTrendBucket,
  SalesTrendPoint,
} from "../domain/metrics";

/**
 * Mission 020 — the read-only aggregation layer Analytics needs and
 * no existing repository provides: cross-table joins (funnel,
 * integrity), GROUP BY breakdowns scoped to an arbitrary date range,
 * and time-bucketed trends. Single-table current-state metrics that
 * already have a home (inventory counts/value, customer count) are
 * deliberately NOT duplicated here — AnalyticsService composes those
 * from VehicleRepository/CustomerRepository directly (Section 1:
 * "Analytics must consume existing authoritative domains", not
 * reimplement them).
 *
 * Every method is business-scoped at construction time, the same
 * convention every repository in Atlas follows.
 */
export interface AnalyticsRepository {
  getLeadStatusCounts(range: ResolvedDateRange): Promise<Record<LeadStatus, number>>;

  getDealStatusCounts(range: ResolvedDateRange): Promise<Record<DealStatus, number>>;

  /** Sum/count of agreedPrice across deals created in range whose status is currently active (non-terminal). */
  getActiveDealPipelineStats(
    range: ResolvedDateRange
  ): Promise<{ activeCount: number; pipelineValue: number }>;

  getSalesStats(
    range: ResolvedDateRange
  ): Promise<{ totalSales: number; grossSalesValue: number }>;

  getHighestValueSale(
    range: ResolvedDateRange
  ): Promise<{ id: string; saleAmount: number; vehicleLabel: string | null } | null>;

  getSalesTrend(range: ResolvedDateRange, bucket: SalesTrendBucket): Promise<SalesTrendPoint[]>;

  getFollowUpMetrics(now: string): Promise<FollowUpMetrics>;

  getFunnelMetrics(range: ResolvedDateRange): Promise<FunnelMetrics>;

  getIntegrityMetrics(): Promise<IntegrityMetrics>;
}

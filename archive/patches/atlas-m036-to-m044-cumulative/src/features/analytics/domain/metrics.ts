import type { LeadStatus } from "../../leads/domain/lead";
import type { DealStatus } from "../../deals/domain/deal";
import type { VehicleStatus } from "../../inventory/data/types";
import type { ResolvedDateRange } from "./date-range";

/**
 * Mission 020 — stable, database-implementation-free result contracts
 * for every Analytics metric. These are what a future consumer (the
 * current UI, or a later Atlas Intelligence module — see Section 14)
 * is meant to depend on: plain data, no query logic, no knowledge of
 * Drizzle/SQLite. A percentage that is mathematically undefined (a
 * zero denominator) is always `null`, never `NaN`/`Infinity` and
 * never silently coerced to 0 — 0 would misleadingly claim "measured
 * and zero" instead of "not yet meaningful" (same convention
 * DashboardSummary's conversionRate already established).
 */

/** Inventory is always a current snapshot — Section 6 explicitly excludes it from date-range filtering. */
export type InventoryMetrics = {
  totalVehicles: number;
  availableVehicles: number;
  reservedVehicles: number;
  soldVehicles: number;
  vehiclesByStatus: Record<VehicleStatus, number>;
  /** Sum of listed price across active (non-sold) inventory — mirrors DashboardSummary.totalInventoryValue. */
  currentInventoryValue: number;
  /** Mission 026 — raw fact, not threshold-filtered: age in days (as of the overview's `now`) of every currently-available vehicle, oldest first. M021's vehicle-attention rule applies its own centralized threshold to this array — see intelligence/domain/thresholds.ts. */
  availableVehicleAgeDays: number[];
  /** Mission 027 — the cross-entity counterpart: age in days of every currently-available vehicle that additionally has zero active leads referencing it (won/lost don't count — see leads/domain/lead.ts's LEAD_ACTIVE_STATUSES). A strict subset of availableVehicleAgeDays. Not threshold-filtered here, same "facts vs thresholds" split. */
  availableVehicleAgeDaysWithoutActiveLead: number[];
};

/** Ranged by Lead.createdAt, except totalCustomers which is a current snapshot (a customer isn't "created within a period" in any way that matters to CRM headcount). */
export type CrmMetrics = {
  totalCustomers: number;
  totalLeads: number;
  activeLeads: number;
  leadsByStatus: Record<LeadStatus, number>;
  wonLeads: number;
  lostLeads: number;
};

/** Ranged by Deal.createdAt. Pipeline value/average are computed only over the active (non-terminal) subset of that same ranged set. */
export type DealMetrics = {
  activeDeals: number;
  completedDeals: number;
  cancelledDeals: number;
  dealsByStatus: Record<DealStatus, number>;
  /** Sum of agreedPrice across active deals created in range. */
  pipelineValue: number;
  averageAgreedPrice: number | null;
};

/** Ranged by Sale.soldAt — Sale is the authoritative finalized-transaction source (Section 3). saleAmount is deliberately never called "revenue" (Atlas has no accounting domain). */
export type SalesMetrics = {
  totalSales: number;
  grossSalesValue: number;
  averageSaleValue: number | null;
  highestValueSale: { id: string; saleAmount: number; vehicleLabel: string | null } | null;
};

export type SalesTrendBucket = "day" | "week" | "month";

export type SalesTrendPoint = {
  /** Inclusive ISO start of this bucket. */
  periodStart: string;
  /** Human-readable bucket label for direct display. */
  periodLabel: string;
  salesCount: number;
  grossValue: number;
};

/**
 * NOT ranged by the selected date filter — a follow-up is either due
 * relative to *now*, or it isn't; filtering it by a creation-date
 * range would answer a different question ("follow-ups on leads
 * created in period X") than the operational one this metric exists
 * for ("what needs attention today").
 */
export type FollowUpMetrics = {
  dueFollowUps: number;
  overdueFollowUps: number;
  upcomingFollowUps: number;
  activeLeadsWithoutFollowUp: number;
};

/**
 * Ranged by Lead.createdAt for the lead-anchored stages; deal→sale
 * uses Deal.createdAt for its own denominator (Section 4 — "deal →
 * sale conversion where meaningful" isn't lead-anchored). Every count
 * here is a DISTINCT lead/deal identity count, never a row count off
 * a join — so a lead with several historical Deals, or a Deal that
 * was reopened, can't inflate a stage's count past the number of
 * leads/deals actually in it (Section 4's explicit requirement).
 */
export type FunnelMetrics = {
  totalLeads: number;
  leadsWithDeals: number;
  leadsWithCompletedDeals: number;
  leadsWithSales: number;
  leadToDealRate: number | null;
  leadToCompletedDealRate: number | null;
  leadToSaleRate: number | null;
  completedDealsInRange: number;
  completedDealsWithSaleInRange: number;
  dealToSaleRate: number | null;
};

/**
 * NOT ranged — this is an operational "what needs attention right
 * now" metric (Section 5), not a historical count. A completed Deal
 * from six months ago that still has no Sale is exactly as much of an
 * open item today as one completed yesterday.
 */
export type IntegrityMetrics = {
  completedDealsAwaitingSale: number;
};

export type AnalyticsOverview = {
  dateRange: ResolvedDateRange;
  inventory: InventoryMetrics;
  crm: CrmMetrics;
  deals: DealMetrics;
  sales: SalesMetrics;
  salesTrend: SalesTrendPoint[];
  followUps: FollowUpMetrics;
  funnel: FunnelMetrics;
  integrity: IntegrityMetrics;
};

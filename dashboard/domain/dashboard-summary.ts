import type { VehicleStatus } from "../../inventory/data/types";

/**
 * Top-level dashboard metrics.
 *
 * Business rule for value/average: "active inventory" means vehicles
 * NOT in "sold" status (available + reserved). Sold vehicles are
 * excluded from totalInventoryValue and averageVehiclePrice — the
 * dashboard is meant to answer "what's my inventory worth right now",
 * and a sold car is no longer inventory on the lot. See
 * DashboardService for where this is applied.
 */
export type DashboardSummary = {
  totalVehicles: number;
  availableVehicles: number;
  reservedVehicles: number;
  soldVehicles: number;
  /** Sum of listed price across active (non-sold) inventory, in KSh. */
  totalInventoryValue: number;
  /** Average listed price across active (non-sold) inventory, in KSh, rounded to the nearest shilling. */
  averageVehiclePrice: number;
  /** Vehicles added within the last 7 days. */
  recentlyAddedCount: number;
};

export type StatusBreakdownItem = {
  status: VehicleStatus;
  label: string;
  count: number;
};

export type MakeBreakdownItem = {
  make: string;
  count: number;
};

export const RECENT_WINDOW_DAYS = 7;
export const DEFAULT_MAKE_BREAKDOWN_LIMIT = 5;
export const DEFAULT_RECENT_VEHICLES_LIMIT = 5;
export const DEFAULT_MOST_INTERESTED_LIMIT = 5;
export const DEFAULT_RECENT_LEADS_LIMIT = 5;

/**
 * Lead status bucketing for the dashboard (Mission 010, updated
 * Mission 015):
 * - newLeads: status === "new"
 * - activeLeads: new + contacted + qualified + negotiating (still being worked)
 * - closedLeads: won + lost (no longer actionable, either outcome) — kept for
 *   backward compatibility with existing consumers of this summary
 * - wonLeads / lostLeads: the two terminal outcomes, split out
 * - conversionRate: wonLeads / (wonLeads + lostLeads), i.e. the share of
 *   *decided* leads that were won. Undefined (not 0) when there are no
 *   decided leads yet, since 0% would misleadingly suggest "all lost".
 *   Deliberately NOT "won / totalLeads" — active leads haven't been
 *   decided yet and shouldn't count against the rate.
 */
export type CustomerLeadSummary = {
  totalCustomers: number;
  newLeads: number;
  activeLeads: number;
  closedLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number | null;
};

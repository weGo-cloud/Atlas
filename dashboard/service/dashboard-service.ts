import { VEHICLE_STATUSES, VEHICLE_STATUS_LABEL } from "../../inventory/data/types";
import type { Vehicle } from "../../inventory/data/types";
import type { VehicleRepository } from "../../inventory/repository/vehicle-repository";
import type { CustomerRepository } from "../../customers/repository/customer-repository";
import type { LeadRepository } from "../../leads/repository/lead-repository";
import type { Lead } from "../../leads/domain/lead";
import {
  DEFAULT_MAKE_BREAKDOWN_LIMIT,
  DEFAULT_MOST_INTERESTED_LIMIT,
  DEFAULT_RECENT_LEADS_LIMIT,
  DEFAULT_RECENT_VEHICLES_LIMIT,
  RECENT_WINDOW_DAYS,
  type CustomerLeadSummary,
  type DashboardSummary,
  type MakeBreakdownItem,
  type StatusBreakdownItem,
} from "../domain/dashboard-summary";

/**
 * Dashboard-facing read layer. Depends on repositories directly (not
 * services) — these are read-only aggregate queries with no
 * create/update/status-transition business rules to apply, so routing
 * them through the vehicle/customer/lead services would add an
 * unnecessary layer without changing behavior. Reuses query methods
 * those repositories already had built for their own features
 * (countByStatus, listPaged, countByStatus for leads, etc.) rather
 * than duplicating that query logic.
 */
export class DashboardService {
  constructor(
    private readonly vehicleRepository: VehicleRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly leadRepository: LeadRepository
  ) {}

  async getSummary(): Promise<DashboardSummary> {
    const [counts, valueStats, recentlyAddedCount] = await Promise.all([
      this.vehicleRepository.countByStatus(),
      this.vehicleRepository.getActiveInventoryValueStats(),
      this.vehicleRepository.countAddedSince(recentWindowCutoffIso()),
    ]);

    return {
      totalVehicles: counts.available + counts.reserved + counts.sold,
      availableVehicles: counts.available,
      reservedVehicles: counts.reserved,
      soldVehicles: counts.sold,
      totalInventoryValue: valueStats.totalValue,
      averageVehiclePrice: valueStats.averagePrice,
      recentlyAddedCount,
    };
  }

  async getStatusBreakdown(): Promise<StatusBreakdownItem[]> {
    const counts = await this.vehicleRepository.countByStatus();
    return VEHICLE_STATUSES.map((status) => ({
      status,
      label: VEHICLE_STATUS_LABEL[status],
      count: counts[status],
    }));
  }

  async getMakeBreakdown(
    limit: number = DEFAULT_MAKE_BREAKDOWN_LIMIT
  ): Promise<MakeBreakdownItem[]> {
    return this.vehicleRepository.countByMake(limit);
  }

  /** Most recently added vehicles — reuses Mission 008's listPaged rather than a bespoke query. */
  async getRecentlyAdded(
    limit: number = DEFAULT_RECENT_VEHICLES_LIMIT
  ): Promise<Vehicle[]> {
    const result = await this.vehicleRepository.listPaged({
      sort: "newest",
      page: 1,
      pageSize: limit,
    });
    return result.items;
  }

  async getCustomerLeadSummary(): Promise<CustomerLeadSummary> {
    const [totalCustomers, leadCounts] = await Promise.all([
      this.customerRepository.countCustomers(),
      this.leadRepository.countByStatus(),
    ]);

    const wonLeads = leadCounts.won;
    const lostLeads = leadCounts.lost;
    const decided = wonLeads + lostLeads;

    return {
      totalCustomers,
      newLeads: leadCounts.new,
      activeLeads:
        leadCounts.new + leadCounts.contacted + leadCounts.qualified + leadCounts.negotiating,
      closedLeads: wonLeads + lostLeads,
      wonLeads,
      lostLeads,
      conversionRate: decided > 0 ? wonLeads / decided : null,
    };
  }

  /** Vehicles with the most lead interest, highest first — resolves vehicle info in one batched query. */
  async getMostInterestedVehicles(
    limit: number = DEFAULT_MOST_INTERESTED_LIMIT
  ): Promise<{ vehicle: Vehicle; leadCount: number }[]> {
    const ranked = await this.leadRepository.countLeadsByVehicle(limit);
    if (ranked.length === 0) return [];

    const vehicles = await this.vehicleRepository.getByIds(
      ranked.map((r) => r.vehicleId)
    );
    const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));

    return ranked
      .map((r) => {
        const vehicle = vehiclesById.get(r.vehicleId);
        return vehicle ? { vehicle, leadCount: r.count } : null;
      })
      .filter((item): item is { vehicle: Vehicle; leadCount: number } => item !== null);
  }

  async getRecentLeads(limit: number = DEFAULT_RECENT_LEADS_LIMIT): Promise<Lead[]> {
    return this.leadRepository.getRecentLeads(limit);
  }
}

function recentWindowCutoffIso(): string {
  return new Date(
    Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
}

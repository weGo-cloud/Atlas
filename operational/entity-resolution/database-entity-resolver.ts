import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { DealRepository } from "../../../deals/repository/deal-repository";
import type { LeadRepository } from "../../../leads/repository/lead-repository";
import type { VehicleRepository } from "../../../inventory/repository/vehicle-repository";
import { INTELLIGENCE_THRESHOLDS } from "../../domain/thresholds";
import type { AffectedEntity } from "../domain/affected-entity";
import { OPERATIONAL_ENTITY_LIMIT, type OperationalEntityResolver } from "./entity-resolver";

/**
 * Mission 022 — Section 4. Built on the *existing* LeadRepository/
 * DealRepository/VehicleRepository (via the Mission-022/026 methods
 * added to each, mirroring their AnalyticsRepository counterparts),
 * not a new intelligence-specific repository — there is no direct
 * SQL anywhere in this class. Business scoping is entirely inherited
 * from however these repositories were constructed (see
 * service/index.ts) — this class never sees or handles a businessId
 * itself.
 */
export class DatabaseOperationalEntityResolver implements OperationalEntityResolver {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly dealRepository: DealRepository,
    private readonly vehicleRepository: VehicleRepository
  ) {}

  async resolveOverdueFollowUpLeads(now: string): Promise<AffectedEntity[]> {
    const leads = await this.leadRepository.getOverdueFollowUpLeads(now, OPERATIONAL_ENTITY_LIMIT);
    return leads.map((lead) => ({
      type: "lead" as const,
      id: lead.id,
      label: lead.vehicleLabel ?? "General inquiry",
      href: `/app/leads/${lead.id}`,
    }));
  }

  async resolveDealsAwaitingSale(): Promise<AffectedEntity[]> {
    const deals = await this.dealRepository.getDealsAwaitingSale(OPERATIONAL_ENTITY_LIMIT);
    return deals.map((deal) => ({
      type: "deal" as const,
      id: deal.id,
      label: deal.vehicleLabel ?? "Untitled deal",
      href: `/app/deals/${deal.id}`,
    }));
  }

  async resolveStagnantPipelineLeads(dateRange: ResolvedDateRange): Promise<AffectedEntity[]> {
    const leads = await this.leadRepository.getActiveLeadsCreatedInRange(
      dateRange.from,
      dateRange.to,
      OPERATIONAL_ENTITY_LIMIT
    );
    return leads.map((lead) => ({
      type: "lead" as const,
      id: lead.id,
      label: lead.vehicleLabel ?? "General inquiry",
      href: `/app/leads/${lead.id}`,
    }));
  }

  /** Mission 026 — reuses M021's own centralized `warningAgeDays` threshold rather than a second copy of the number, so the entity list and the signal that motivated it are always evaluated against the exact same cutoff. */
  async resolveStaleVehicles(now: string): Promise<AffectedEntity[]> {
    const vehicles = await this.vehicleRepository.getStaleAvailableVehicles(
      INTELLIGENCE_THRESHOLDS.vehicleAttention.warningAgeDays,
      now,
      OPERATIONAL_ENTITY_LIMIT
    );
    return vehicles.map((vehicle) => ({
      type: "vehicle" as const,
      id: vehicle.id,
      label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      href: `/app/inventory/${vehicle.id}`,
    }));
  }

  /** Mission 027 — reuses the exact same centralized `warningAgeDays` threshold as `resolveStaleVehicles`, so the entity list always matches the signal that motivated it. */
  async resolveStaleVehiclesWithoutActiveLead(now: string): Promise<AffectedEntity[]> {
    const vehicles = await this.vehicleRepository.getStaleAvailableVehiclesWithoutActiveLead(
      INTELLIGENCE_THRESHOLDS.vehicleAttention.warningAgeDays,
      now,
      OPERATIONAL_ENTITY_LIMIT
    );
    return vehicles.map((vehicle) => ({
      type: "vehicle" as const,
      id: vehicle.id,
      label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      href: `/app/inventory/${vehicle.id}`,
    }));
  }
}

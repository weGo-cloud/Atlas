import { DatabaseCustomerRepository } from "../../customers/repository/database-customer-repository";
import { DatabaseVehicleRepository } from "../../inventory/repository/database-vehicle-repository";
import { DatabaseLeadRepository } from "../../leads/repository/database-lead-repository";
import { DatabaseDealRepository } from "../repository/database-deal-repository";
import { DealService } from "./deal-service";

/**
 * Mission 018 — same rationale as getLeadService: every repository
 * below is scoped to the same businessId, so DealService's "lead
 * must exist" / "vehicle must exist" checks automatically become
 * cross-business isolation checks for free.
 *
 * Mission 018.1 — no longer builds a VehicleService: the Deal status
 * transition's vehicle side effect is applied atomically inside
 * DealService.updateDealStatus itself (see deal-vehicle-transaction.ts),
 * not delegated to VehicleService anymore.
 */
export function getDealService(businessId: string): DealService {
  return new DealService(
    new DatabaseDealRepository(businessId),
    new DatabaseLeadRepository(businessId),
    new DatabaseCustomerRepository(businessId),
    new DatabaseVehicleRepository(businessId)
  );
}

export { DealService };

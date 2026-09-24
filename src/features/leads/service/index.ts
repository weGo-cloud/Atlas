import { DatabaseCustomerRepository } from "../../customers/repository/database-customer-repository";
import { DatabaseVehicleRepository } from "../../inventory/repository/database-vehicle-repository";
import { DatabaseFurnitureProductRepository } from "../../furniture/repository/database-furniture-product-repository";
import { DatabaseLeadRepository } from "../repository/database-lead-repository";
import { LeadService } from "./lead-service";

/**
 * Mission 012 — see inventory/service/index.ts for the factory-vs-
 * singleton rationale. Here it matters even more: LeadService's
 * existing "customer must exist" / "vehicle must exist" checks
 * (Mission 010) automatically become cross-business isolation checks
 * for free, purely because all repositories below are scoped to the
 * same businessId — a lead referencing another business's customer,
 * vehicle, or (Mission 030) furniture product id will correctly fail
 * with CUSTOMER_NOT_FOUND / VEHICLE_NOT_FOUND / FURNITURE_PRODUCT_NOT_FOUND,
 * with zero changes to LeadService's own code.
 */
export function getLeadService(businessId: string): LeadService {
  return new LeadService(
    new DatabaseLeadRepository(businessId),
    new DatabaseCustomerRepository(businessId),
    new DatabaseVehicleRepository(businessId),
    new DatabaseFurnitureProductRepository(businessId)
  );
}

export { LeadService };

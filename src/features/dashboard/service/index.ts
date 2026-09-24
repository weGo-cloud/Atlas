import { DatabaseVehicleRepository } from "../../inventory/repository/database-vehicle-repository";
import { DatabaseCustomerRepository } from "../../customers/repository/database-customer-repository";
import { DatabaseLeadRepository } from "../../leads/repository/database-lead-repository";
import { DashboardService } from "./dashboard-service";

/** Mission 012 — see inventory/service/index.ts for the factory-vs-singleton rationale. Every dashboard metric is now inherently business-scoped, since all three underlying repositories are. */
export function getDashboardService(businessId: string): DashboardService {
  return new DashboardService(
    new DatabaseVehicleRepository(businessId),
    new DatabaseCustomerRepository(businessId),
    new DatabaseLeadRepository(businessId)
  );
}

export { DashboardService };

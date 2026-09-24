import { DatabaseVehicleRepository } from "../../inventory/repository/database-vehicle-repository";
import { DatabaseCustomerRepository } from "../../customers/repository/database-customer-repository";
import { DatabaseAnalyticsRepository } from "../repository/database-analytics-repository";
import { AnalyticsService } from "./analytics-service";

/** Mission 020 — see inventory/service/index.ts for the factory-vs-singleton rationale. Every metric this service returns is inherently business-scoped, since all three underlying repositories are constructed scoped to one business. */
export function getAnalyticsService(businessId: string): AnalyticsService {
  return new AnalyticsService(
    new DatabaseAnalyticsRepository(businessId),
    new DatabaseVehicleRepository(businessId),
    new DatabaseCustomerRepository(businessId)
  );
}

export { AnalyticsService };

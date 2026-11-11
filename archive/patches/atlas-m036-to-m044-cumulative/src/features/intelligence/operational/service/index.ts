import { getIntelligenceService } from "../../service";
import { DatabaseLeadRepository } from "../../../leads/repository/database-lead-repository";
import { DatabaseDealRepository } from "../../../deals/repository/database-deal-repository";
import { DatabaseVehicleRepository } from "../../../inventory/repository/database-vehicle-repository";
import { DatabaseOperationalEntityResolver } from "../entity-resolution/database-entity-resolver";
import { OperationalIntelligenceService } from "./operational-intelligence-service";

/** Mission 022 — see analytics/service/index.ts for the factory-vs-singleton rationale. Every dependency here (IntelligenceService, all three repositories) is constructed scoped to one business, so the result is inherently business-scoped end to end. */
export function getOperationalIntelligenceService(businessId: string): OperationalIntelligenceService {
  return new OperationalIntelligenceService(
    getIntelligenceService(businessId),
    new DatabaseOperationalEntityResolver(
      new DatabaseLeadRepository(businessId),
      new DatabaseDealRepository(businessId),
      new DatabaseVehicleRepository(businessId)
    )
  );
}

export { OperationalIntelligenceService };

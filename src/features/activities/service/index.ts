import { DatabaseCustomerRepository } from "../../customers/repository/database-customer-repository";
import { DatabaseLeadRepository } from "../../leads/repository/database-lead-repository";
import { DatabaseActivityRepository } from "../repository/database-activity-repository";
import { ActivityService } from "./activity-service";

/**
 * Mission 017 — same rationale as getLeadService: all three
 * repositories are scoped to the same businessId, so ActivityService's
 * "customer must exist" / "lead must exist and match the customer"
 * checks become cross-business isolation checks for free.
 */
export function getActivityService(businessId: string): ActivityService {
  return new ActivityService(
    new DatabaseActivityRepository(businessId),
    new DatabaseCustomerRepository(businessId),
    new DatabaseLeadRepository(businessId)
  );
}

export { ActivityService };

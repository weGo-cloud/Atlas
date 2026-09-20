import { DatabaseSubscriptionRepository } from "../repository/database-subscription-repository";
import { EntitlementService } from "./entitlement-service";
import { SubscriptionLifecycleService } from "./subscription-lifecycle-service";

export function getEntitlementService(): EntitlementService {
  return new EntitlementService(new DatabaseSubscriptionRepository());
}

/** Mission 029 — mirrors getEntitlementService's wiring exactly; a fresh DatabaseSubscriptionRepository per call, same as every other feature's `service/index.ts`. */
export function getSubscriptionLifecycleService(): SubscriptionLifecycleService {
  return new SubscriptionLifecycleService(new DatabaseSubscriptionRepository());
}

export { EntitlementService, SubscriptionLifecycleService };

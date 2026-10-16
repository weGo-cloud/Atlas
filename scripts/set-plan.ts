import "dotenv/config";

import { getSubscriptionLifecycleService } from "../src/features/entitlements/service";
import { isSubscriptionPlan } from "../src/features/entitlements/domain/plan";

/**
 * Mission 036 — the manual way to put a business on a plan while
 * payment is collected outside Atlas (M-Pesa) and no billing provider
 * exists. Usage: npm run plan:set -- <businessId> <starter|growth|pro>
 * Goes through SubscriptionLifecycleService.changePlan, so it
 * reactivates an ended subscription, never touches inventory data, and
 * respects the plan's assignability rules.
 */
async function main() {
  const [businessId, plan] = process.argv.slice(2);
  if (!businessId || !plan || !isSubscriptionPlan(plan)) {
    console.error("Usage: npm run plan:set -- <businessId> <starter|growth|pro>");
    process.exitCode = 1;
    return;
  }
  const subscription = await getSubscriptionLifecycleService().changePlan(businessId, plan);
  console.log(`Business ${businessId} is now on the ${subscription.plan} plan (status: ${subscription.status}).`);
}

main().catch((error) => {
  console.error("Failed to set plan:", error);
  process.exitCode = 1;
});

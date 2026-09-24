import { Settings } from "lucide-react";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { getEntitlementService, getSubscriptionLifecycleService } from "@/features/entitlements/service";
import { capabilitiesFor, listPlans, planDefinition } from "@/features/entitlements/domain/plan";
import { accessLevelMessage } from "@/features/entitlements/domain/access-policy";
import { PlanSettings } from "@/features/entitlements/components/plan-settings";
import { ConversionSettings } from "@/features/auth/components/conversion-settings";
import { getVehicleService } from "@/features/inventory/service";

export const metadata = { title: "Settings · Atlas" };

/**
 * Mission 028 — the plan/subscription summary and the conversion-layer
 * controls (website mode, integration API key) both read the
 * business's current entitlements the same way: resolve the
 * Subscription via EntitlementService, then read capabilities off the
 * plan catalog (entitlements/domain/plan.ts) — never a locally
 * re-derived plan comparison. Everything below is display and
 * delegation.
 *
 * Mission 029 — reconcileElapsed runs first so a subscription whose
 * trial (or "cancel at period end" window) has already elapsed shows
 * its true current status on this page even if nothing else has
 * written that transition yet (see SubscriptionLifecycleService's
 * doc comment on why this is a separate explicit step rather than a
 * hidden side effect of a read).
 */
export default async function SettingsPage() {
  const { business } = await requireCurrentSession();
  const entitlementService = getEntitlementService();

  let subscription = await entitlementService.getSubscription(business.id);
  if (subscription) {
    subscription = await getSubscriptionLifecycleService().reconcileElapsed(business.id, new Date());
  }

  const plan = subscription?.plan ?? "starter";
  const entitledCapabilities = capabilitiesFor(plan);
  const planName = planDefinition(plan).name;
  const accessLevel = await entitlementService.getAccessLevel(business.id);
  const statusMessage = accessLevel === "no_subscription" ? null : accessLevelMessage(accessLevel);

  const vehicleCounts = await getVehicleService(business.id).countByStatus();
  const vehicleUsage = vehicleCounts.available + vehicleCounts.reserved + vehicleCounts.sold;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            {business.name} · {planName} plan
            {subscription && subscription.status !== "active" ? ` (${subscription.status})` : ""}
            {entitledCapabilities.length > 0 ? ` · ${entitledCapabilities.join(", ")}` : ""}
          </p>
        </div>
      </div>

      <PlanSettings
        subscription={subscription}
        plans={listPlans()}
        vehicleUsage={vehicleUsage}
        statusMessage={statusMessage}
      />

      <ConversionSettings
        business={business}
        canUseStorefront={entitledCapabilities.includes("storefront")}
        canUseIntegration={entitledCapabilities.includes("external_integration")}
      />
    </div>
  );
}

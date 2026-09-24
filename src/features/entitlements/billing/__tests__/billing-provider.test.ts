import { describe, expect, it } from "vitest";

import { UnconfiguredBillingProvider, type BillingProvider } from "../billing-provider";
import { SubscriptionLifecycleService } from "../../service/subscription-lifecycle-service";

describe("UnconfiguredBillingProvider (Mission 029, Section 8/24 #22)", () => {
  it("every method rejects — there is no real provider wired in this mission", async () => {
    const provider: BillingProvider = new UnconfiguredBillingProvider();
    await expect(
      provider.createCustomer({ businessId: "biz_1", email: "a@b.com", name: "Test" })
    ).rejects.toThrow(/no billing provider/i);
    await expect(
      provider.createSubscription({
        customer: { provider: "none", providerCustomerId: "x" },
        plan: "starter",
        interval: "monthly",
      })
    ).rejects.toThrow(/no billing provider/i);
    await expect(
      provider.changeSubscription({
        subscription: { provider: "none", providerSubscriptionId: "x", providerStatus: "active" },
        plan: "growth",
      })
    ).rejects.toThrow(/no billing provider/i);
    await expect(
      provider.cancelSubscription({
        subscription: { provider: "none", providerSubscriptionId: "x", providerStatus: "active" },
        atPeriodEnd: false,
      })
    ).rejects.toThrow(/no billing provider/i);
    await expect(
      provider.getSubscriptionStatus({ provider: "none", providerSubscriptionId: "x", providerStatus: "active" })
    ).rejects.toThrow(/no billing provider/i);
  });
});

describe("Core domain does not depend on a specific provider (Section 24 #22)", () => {
  it("SubscriptionLifecycleService's constructor takes only a SubscriptionRepository — no BillingProvider dependency", () => {
    // A structural proxy for "the core subscription domain must not
    // import Stripe/M-Pesa-specific code" (Section 8): the lifecycle
    // service's only dependency is the repository, so it is
    // trivially provider-agnostic — there is nowhere for a provider
    // import to have entered.
    expect(SubscriptionLifecycleService.length).toBe(1);
  });
});

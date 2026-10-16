import { describe, expect, it } from "vitest";

import { planNotice, trialDaysLeft } from "../plan-notice";
import { resolveEffectiveSubscription, type Subscription } from "../subscription";

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub_1",
    businessId: "biz_1",
    plan: "pro",
    status: "trialing",
    trialEndsAt: "2026-01-15T00:00:00.000Z",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    provider: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    providerStatus: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("trialDaysLeft", () => {
  it("rounds partial days up and never reports less than one day while the trial runs", () => {
    expect(trialDaysLeft("2026-01-15T00:00:00.000Z", new Date("2026-01-01T00:00:00.000Z"))).toBe(14);
    expect(trialDaysLeft("2026-01-15T00:00:00.000Z", new Date("2026-01-14T23:00:00.000Z"))).toBe(1);
  });
});

describe("planNotice", () => {
  it("says how many trial days are left for a running trial", () => {
    const now = new Date("2026-01-10T00:00:00.000Z");
    const notice = planNotice(resolveEffectiveSubscription(sub(), now), now);
    expect(notice?.kind).toBe("trial_active");
    expect(notice?.message).toContain("5 days");
  });

  it("uses singular wording for the last day", () => {
    const now = new Date("2026-01-14T12:00:00.000Z");
    const notice = planNotice(resolveEffectiveSubscription(sub(), now), now);
    expect(notice?.message).toContain("1 day left");
  });

  it("explains the Starter fallback and that data is safe once the trial has ended", () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    const notice = planNotice(resolveEffectiveSubscription(sub(), now), now);
    expect(notice?.kind).toBe("trial_ended");
    expect(notice?.message).toContain("Starter");
    expect(notice?.message).toContain("data is safe");
  });

  it("explains an ended paid subscription separately from an ended trial", () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    const notice = planNotice(resolveEffectiveSubscription(sub({ status: "cancelled", trialEndsAt: null }), now), now);
    expect(notice?.kind).toBe("subscription_ended");
  });

  it("shows nothing for a plain active subscription", () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    expect(planNotice(resolveEffectiveSubscription(sub({ status: "active", trialEndsAt: null }), now), now)).toBeNull();
  });
});

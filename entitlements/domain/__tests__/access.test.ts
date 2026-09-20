import { describe, expect, it } from "vitest";

import type { Subscription } from "../subscription";
import { evaluateCapabilityAccess, evaluateLimit } from "../access";

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub_1",
    businessId: "biz_1",
    plan: "growth",
    status: "active",
    trialEndsAt: null,
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

describe("evaluateCapabilityAccess", () => {
  it("grants an entitled capability on an active subscription", () => {
    const decision = evaluateCapabilityAccess(subscription({ plan: "growth", status: "active" }), "storefront");
    expect(decision).toEqual({ allowed: true, reason: "CAPABILITY_GRANTED" });
  });

  it("denies a capability the plan doesn't include", () => {
    const decision = evaluateCapabilityAccess(subscription({ plan: "starter" }), "storefront");
    expect(decision).toEqual({ allowed: false, reason: "PLAN_DOES_NOT_INCLUDE_CAPABILITY" });
  });

  it("denies access on a cancelled subscription even for an otherwise-entitled plan", () => {
    const decision = evaluateCapabilityAccess(subscription({ plan: "pro", status: "cancelled" }), "storefront");
    expect(decision).toEqual({ allowed: false, reason: "SUBSCRIPTION_INACTIVE" });
  });

  it("still grants access on a past_due subscription (grace period)", () => {
    const decision = evaluateCapabilityAccess(subscription({ plan: "growth", status: "past_due" }), "storefront");
    expect(decision.allowed).toBe(true);
  });

  it("still grants access while trialing", () => {
    const decision = evaluateCapabilityAccess(subscription({ plan: "growth", status: "trialing" }), "storefront");
    expect(decision.allowed).toBe(true);
  });
});

describe("evaluateLimit", () => {
  it("is unlimited on a plan with no limit for the key (pro)", () => {
    const decision = evaluateLimit(subscription({ plan: "pro" }), "vehicles", 10_000);
    expect(decision).toEqual({ allowed: true, reason: "UNLIMITED", limit: null, currentUsage: 10_000 });
  });

  it("allows usage below the plan's limit", () => {
    const decision = evaluateLimit(subscription({ plan: "starter" }), "vehicles", 10);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("WITHIN_LIMIT");
    expect(decision.limit).toBe(50);
  });

  it("rejects usage at or above the plan's limit", () => {
    const decision = evaluateLimit(subscription({ plan: "starter" }), "vehicles", 50);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("LIMIT_EXCEEDED");
  });

  it("denies even a within-limit usage on an inactive subscription", () => {
    const decision = evaluateLimit(subscription({ plan: "starter", status: "expired" }), "vehicles", 1);
    expect(decision).toEqual({ allowed: false, reason: "SUBSCRIPTION_INACTIVE", limit: null, currentUsage: 1 });
  });
});

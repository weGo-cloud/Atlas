import { describe, expect, it } from "vitest";

import {
  SUBSCRIPTION_STATUSES,
  isSubscriptionStatus,
  isTrialActive,
  resolveEffectiveStatus,
  statusGrantsAccess,
  type Subscription,
} from "../subscription";

function fixture(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub_1",
    businessId: "biz_1",
    plan: "starter",
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

describe("SUBSCRIPTION_STATUSES / isSubscriptionStatus", () => {
  it("recognizes every declared status", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(isSubscriptionStatus(status)).toBe(true);
    }
  });

  it("rejects an unknown status string", () => {
    expect(isSubscriptionStatus("suspended")).toBe(false);
    expect(isSubscriptionStatus("")).toBe(false);
  });
});

describe("statusGrantsAccess", () => {
  it("grants access for trialing, active, and past_due (grace period)", () => {
    expect(statusGrantsAccess("trialing")).toBe(true);
    expect(statusGrantsAccess("active")).toBe(true);
    expect(statusGrantsAccess("past_due")).toBe(true);
  });

  it("does not grant access for paused, cancelled, or expired", () => {
    expect(statusGrantsAccess("paused")).toBe(false);
    expect(statusGrantsAccess("cancelled")).toBe(false);
    expect(statusGrantsAccess("expired")).toBe(false);
  });
});

/** Mission 029, Section 11/24 #10 — trial expiration must be deterministic, driven by an explicit `now`, never a hidden clock read. */
describe("resolveEffectiveStatus — trial expiration", () => {
  it("stays 'trialing' while now is before trialEndsAt", () => {
    const subscription = fixture({ status: "trialing", trialEndsAt: "2026-09-15T00:00:00.000Z" });
    expect(resolveEffectiveStatus(subscription, new Date("2026-09-14T23:59:59.000Z"))).toBe("trialing");
  });

  it("becomes 'expired' the instant now reaches trialEndsAt", () => {
    const subscription = fixture({ status: "trialing", trialEndsAt: "2026-09-15T00:00:00.000Z" });
    expect(resolveEffectiveStatus(subscription, new Date("2026-09-15T00:00:00.000Z"))).toBe("expired");
  });

  it("stays 'expired' well after trialEndsAt", () => {
    const subscription = fixture({ status: "trialing", trialEndsAt: "2026-09-15T00:00:00.000Z" });
    expect(resolveEffectiveStatus(subscription, new Date("2026-12-01T00:00:00.000Z"))).toBe("expired");
  });

  it("is deterministic — the same subscription and now always produce the same result", () => {
    const subscription = fixture({ status: "trialing", trialEndsAt: "2026-09-15T00:00:00.000Z" });
    const now = new Date("2026-10-01T00:00:00.000Z");
    expect(resolveEffectiveStatus(subscription, now)).toBe(resolveEffectiveStatus(subscription, now));
  });

  it("ignores trialEndsAt entirely when status isn't trialing", () => {
    const subscription = fixture({ status: "active", trialEndsAt: "2020-01-01T00:00:00.000Z" });
    expect(resolveEffectiveStatus(subscription, new Date("2026-01-01T00:00:00.000Z"))).toBe("active");
  });
});

/** Mission 029, Section 12 — "cancel at period end" resolves to cancelled once the period has actually elapsed, without needing a background job to have run first. */
describe("resolveEffectiveStatus — cancel at period end", () => {
  it("stays active before currentPeriodEnd even with cancelAtPeriodEnd set", () => {
    const subscription = fixture({
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-09-30T00:00:00.000Z",
    });
    expect(resolveEffectiveStatus(subscription, new Date("2026-09-01T00:00:00.000Z"))).toBe("active");
  });

  it("becomes cancelled once currentPeriodEnd has passed", () => {
    const subscription = fixture({
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-09-30T00:00:00.000Z",
    });
    expect(resolveEffectiveStatus(subscription, new Date("2026-10-01T00:00:00.000Z"))).toBe("cancelled");
  });

  it("has no effect when cancelAtPeriodEnd is false", () => {
    const subscription = fixture({
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2020-01-01T00:00:00.000Z",
    });
    expect(resolveEffectiveStatus(subscription, new Date("2026-01-01T00:00:00.000Z"))).toBe("active");
  });
});

describe("isTrialActive", () => {
  it("is true while trialing and before trialEndsAt", () => {
    const subscription = fixture({ status: "trialing", trialEndsAt: "2026-09-15T00:00:00.000Z" });
    expect(isTrialActive(subscription, new Date("2026-09-01T00:00:00.000Z"))).toBe(true);
  });

  it("is false once trialEndsAt has passed", () => {
    const subscription = fixture({ status: "trialing", trialEndsAt: "2026-09-15T00:00:00.000Z" });
    expect(isTrialActive(subscription, new Date("2026-10-01T00:00:00.000Z"))).toBe(false);
  });

  it("is false for a non-trialing subscription", () => {
    const subscription = fixture({ status: "active" });
    expect(isTrialActive(subscription, new Date())).toBe(false);
  });
});

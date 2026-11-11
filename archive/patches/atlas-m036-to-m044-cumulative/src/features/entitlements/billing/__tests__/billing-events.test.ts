import { describe, expect, it } from "vitest";

import { applyBillingEvent, type BillingEvent } from "../billing-events";

describe("applyBillingEvent", () => {
  it("maps subscription.created's providerStatus onto a SubscriptionStatus patch", () => {
    const event: BillingEvent = {
      type: "subscription.created",
      businessId: "biz_1",
      plan: "growth",
      providerStatus: "trialing",
      occurredAt: "2026-01-01T00:00:00.000Z",
    };
    expect(applyBillingEvent(event)).toEqual({ status: "trialing" });
  });

  it("maps subscription.updated's providerStatus onto a status patch", () => {
    const event: BillingEvent = {
      type: "subscription.updated",
      businessId: "biz_1",
      providerStatus: "past_due",
      occurredAt: "2026-01-01T00:00:00.000Z",
    };
    expect(applyBillingEvent(event)).toEqual({ status: "past_due" });
  });

  it("returns null for an unrecognized provider status string rather than guessing", () => {
    const event: BillingEvent = {
      type: "subscription.updated",
      businessId: "biz_1",
      providerStatus: "some_future_provider_status_atlas_has_never_seen",
      occurredAt: "2026-01-01T00:00:00.000Z",
    };
    expect(applyBillingEvent(event)).toBeNull();
  });

  it("subscription.cancelled always maps to cancelled and clears cancelAtPeriodEnd", () => {
    const event: BillingEvent = { type: "subscription.cancelled", businessId: "biz_1", occurredAt: "2026-01-01T00:00:00.000Z" };
    expect(applyBillingEvent(event)).toEqual({ status: "cancelled", cancelAtPeriodEnd: false });
  });

  it("payment.succeeded and payment.failed don't imply a status change on their own", () => {
    expect(
      applyBillingEvent({ type: "payment.succeeded", businessId: "biz_1", occurredAt: "2026-01-01T00:00:00.000Z" })
    ).toBeNull();
    expect(
      applyBillingEvent({ type: "payment.failed", businessId: "biz_1", occurredAt: "2026-01-01T00:00:00.000Z" })
    ).toBeNull();
  });

  it("is a pure function — the same event always produces the same result, no side effects", () => {
    const event: BillingEvent = {
      type: "subscription.created",
      businessId: "biz_1",
      plan: "pro",
      providerStatus: "active",
      occurredAt: "2026-01-01T00:00:00.000Z",
    };
    expect(applyBillingEvent(event)).toEqual(applyBillingEvent(event));
  });
});

import { describe, expect, it } from "vitest";

import { SUBSCRIPTION_STATUSES } from "../subscription";
import { InvalidSubscriptionTransitionError, assertTransition, canTransition } from "../lifecycle";

describe("canTransition", () => {
  it("allows every status to transition to itself (idempotent retry)", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it("allows trialing to convert to active", () => {
    expect(canTransition("trialing", "active")).toBe(true);
  });

  it("allows trialing to terminate directly (cancelled/expired)", () => {
    expect(canTransition("trialing", "cancelled")).toBe(true);
    expect(canTransition("trialing", "expired")).toBe(true);
  });

  it("rejects trialing jumping straight to past_due or paused", () => {
    expect(canTransition("trialing", "past_due")).toBe(false);
    expect(canTransition("trialing", "paused")).toBe(false);
  });

  it("allows active to fall behind on payment or pause", () => {
    expect(canTransition("active", "past_due")).toBe(true);
    expect(canTransition("active", "paused")).toBe(true);
  });

  it("allows past_due to recover to active", () => {
    expect(canTransition("past_due", "active")).toBe(true);
  });

  it("allows cancelled and expired to reactivate (resubscribe)", () => {
    expect(canTransition("cancelled", "active")).toBe(true);
    expect(canTransition("expired", "active")).toBe(true);
  });

  it("rejects cancelled/expired transitioning to anything other than active", () => {
    expect(canTransition("cancelled", "paused")).toBe(false);
    expect(canTransition("cancelled", "past_due")).toBe(false);
    expect(canTransition("expired", "past_due")).toBe(false);
  });

  it("rejects paused jumping straight to past_due", () => {
    expect(canTransition("paused", "past_due")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("does not throw for an allowed transition", () => {
    expect(() => assertTransition("active", "cancelled")).not.toThrow();
  });

  it("throws InvalidSubscriptionTransitionError for a disallowed transition", () => {
    expect(() => assertTransition("trialing", "paused")).toThrow(InvalidSubscriptionTransitionError);
  });

  it("the thrown error carries the attempted from/to", () => {
    try {
      assertTransition("cancelled", "past_due");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSubscriptionTransitionError);
      const typed = error as InvalidSubscriptionTransitionError;
      expect(typed.from).toBe("cancelled");
      expect(typed.to).toBe("past_due");
    }
  });
});

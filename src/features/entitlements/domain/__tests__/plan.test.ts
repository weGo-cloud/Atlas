import { describe, expect, it } from "vitest";

import {
  EVEREST_MONTHLY_MESSAGE_LIMIT,
  CAPABILITIES,
  LIMIT_KEYS,
  STARTER_ITEM_LIMIT,
  SUBSCRIPTION_PLANS,
  capabilitiesFor,
  hasCapability,
  isAssignableStatus,
  isPaidPlan,
  isPlanAssignable,
  isSubscriptionPlan,
  limitFor,
  listPlans,
  planDefinition,
} from "../plan";

describe("SUBSCRIPTION_PLANS / isSubscriptionPlan", () => {
  it("recognizes every declared plan", () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(isSubscriptionPlan(plan)).toBe(true);
    }
  });

  it("rejects an unknown plan string", () => {
    expect(isSubscriptionPlan("enterprise")).toBe(false);
    expect(isSubscriptionPlan("")).toBe(false);
  });
});

describe("hasCapability / PLANS", () => {
  it("starter has no conversion-layer capabilities", () => {
    for (const capability of CAPABILITIES) {
      expect(hasCapability("starter", capability)).toBe(false);
    }
  });

  // Mission 036 — Growth now includes the external-integration API (the website/chatbot connection); marketing_automation and the assistant moved to Pro.
  it("growth has the storefront and the external integration but not marketing automation or the assistant", () => {
    expect(hasCapability("growth", "storefront")).toBe(true);
    expect(hasCapability("growth", "external_integration")).toBe(true);
    expect(hasCapability("growth", "marketing_automation")).toBe(false);
    expect(hasCapability("growth", "everest")).toBe(false);
  });

  it("starter has no add-on capabilities", () => {
    for (const capability of CAPABILITIES) {
      expect(hasCapability("starter", capability)).toBe(false);
    }
  });

  it("pro has every declared capability (cumulative tiers)", () => {
    for (const capability of CAPABILITIES) {
      expect(hasCapability("pro", capability)).toBe(true);
    }
  });
});

describe("capabilitiesFor", () => {
  it("returns an empty list for starter", () => {
    expect(capabilitiesFor("starter")).toEqual([]);
  });

  it("returns exactly the capabilities a plan is entitled to", () => {
    expect(new Set(capabilitiesFor("growth"))).toEqual(new Set(["storefront", "external_integration"]));
    expect(new Set(capabilitiesFor("pro"))).toEqual(new Set(CAPABILITIES));
  });
});

describe("limitFor / usage limits", () => {
  // Mission 036 — Starter is the free tier: 30 items per vertical.
  it("starter has a finite item limit of STARTER_ITEM_LIMIT for both verticals", () => {
    expect(limitFor("starter", "vehicles")).toBe(STARTER_ITEM_LIMIT);
    expect(limitFor("starter", "furniture_products")).toBe(STARTER_ITEM_LIMIT);
    expect(STARTER_ITEM_LIMIT).toBe(30);
  });

  it("Everest messages are capped on Pro and not offered on lower plans", () => {
    expect(limitFor("pro", "everest_messages")).toBe(EVEREST_MONTHLY_MESSAGE_LIMIT);
    expect(limitFor("starter", "everest_messages")).toBeNull();
  });

  it("growth has a higher finite vehicle limit than starter", () => {
    const growth = limitFor("growth", "vehicles");
    const starter = limitFor("starter", "vehicles");
    expect(growth).not.toBeNull();
    expect(starter).not.toBeNull();
    expect(growth as number).toBeGreaterThan(starter as number);
  });

  it("pro has no vehicle limit (unlimited)", () => {
    expect(limitFor("pro", "vehicles")).toBeNull();
  });

  it("every declared limit key is representable for every plan (no throw)", () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      for (const key of LIMIT_KEYS) {
        expect(() => limitFor(plan, key)).not.toThrow();
      }
    }
  });
});

describe("planDefinition", () => {
  it("returns a human-readable name for every plan", () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(planDefinition(plan).name.length).toBeGreaterThan(0);
    }
  });

  it("Mission 029 — resolves deterministically for the same plan every call (Section 24 #3)", () => {
    const first = planDefinition("growth");
    const second = planDefinition("growth");
    expect(first).toEqual(second);
  });

  // Mission 036 — prices are now the owner's configured decision (Growth KES 5,000, Pro KES 13,000; Starter free). Nothing is inferred: a plan without an owner-supplied number would still be `configured: false`.
  it("Mission 036 — prices are the owner-configured values", () => {
    expect(planDefinition("starter").pricing).toEqual({ configured: true, amount: 0, currency: "KES", interval: "monthly" });
    expect(planDefinition("growth").pricing).toEqual({ configured: true, amount: 5000, currency: "KES", interval: "monthly" });
    expect(planDefinition("pro").pricing).toEqual({ configured: true, amount: 13000, currency: "KES", interval: "monthly" });
  });

  it("Mission 036 — isPaidPlan is true only for plans priced above zero", () => {
    expect(isPaidPlan("starter")).toBe(false);
    expect(isPaidPlan("growth")).toBe(true);
    expect(isPaidPlan("pro")).toBe(true);
  });

  it("Mission 029, Section 3 — every plan has a factual, non-empty description", () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(planDefinition(plan).description.length).toBeGreaterThan(0);
    }
  });
});

describe("listPlans (Mission 029, Section 3/4)", () => {
  it("returns every plan in ascending order", () => {
    const plans = listPlans();
    expect(plans.map((p) => p.id)).toEqual(["starter", "growth", "pro"]);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].order).toBeGreaterThan(plans[i - 1].order);
    }
  });
});

describe("isAssignableStatus / isPlanAssignable (Mission 029, Section 24 #2)", () => {
  it("an 'active' plan status is assignable", () => {
    expect(isAssignableStatus("active")).toBe(true);
  });

  it("an 'inactive' plan status is not assignable", () => {
    expect(isAssignableStatus("inactive")).toBe(false);
  });

  it("every shipped plan is currently assignable", () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(isPlanAssignable(plan)).toBe(true);
    }
  });
});

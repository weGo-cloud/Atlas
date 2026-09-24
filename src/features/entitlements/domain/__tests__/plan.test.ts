import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  LIMIT_KEYS,
  SUBSCRIPTION_PLANS,
  capabilitiesFor,
  hasCapability,
  isAssignableStatus,
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

  it("growth has the storefront but not external integration", () => {
    expect(hasCapability("growth", "storefront")).toBe(true);
    expect(hasCapability("growth", "external_integration")).toBe(false);
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
    expect(new Set(capabilitiesFor("growth"))).toEqual(new Set(["storefront", "marketing_automation"]));
    expect(new Set(capabilitiesFor("pro"))).toEqual(new Set(CAPABILITIES));
  });
});

describe("limitFor / usage limits", () => {
  it("starter has a finite vehicle limit", () => {
    expect(limitFor("starter", "vehicles")).toBe(50);
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

  it("Mission 029, Section 3 — never fabricates a price: every shipped plan is marked not-configured", () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(planDefinition(plan).pricing.configured).toBe(false);
    }
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

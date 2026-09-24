import { describe, expect, it } from "vitest";

import { contextFrom } from "../../__tests__/fixtures";
import { weakLeadConversionRule, stagnantPipelineRule } from "../lead-pipeline-rules";

const NOW = "2026-09-02T12:00:00.000Z";

describe("weakLeadConversionRule", () => {
  function ctx(totalLeads: number, leadsWithDeals: number, leadToDealRate: number | null) {
    return contextFrom({
      funnel: {
        totalLeads,
        leadsWithDeals,
        leadsWithCompletedDeals: 0,
        leadsWithSales: 0,
        leadToDealRate,
        leadToCompletedDealRate: null,
        leadToSaleRate: null,
        completedDealsInRange: 0,
        completedDealsWithSaleInRange: 0,
        dealToSaleRate: null,
      },
    });
  }

  it("does not trigger below the minimum lead sample even at 0% conversion", () => {
    expect(weakLeadConversionRule.evaluate(ctx(5, 0, 0), NOW)).toBeNull();
  });

  it("does not trigger when the rate is undefined (null denominator)", () => {
    expect(weakLeadConversionRule.evaluate(ctx(0, 0, null), NOW)).toBeNull();
  });

  it("does not trigger at/above the warning rate", () => {
    expect(weakLeadConversionRule.evaluate(ctx(20, 4, 0.2), NOW)).toBeNull();
  });

  it("triggers WARNING just below the warning rate", () => {
    expect(weakLeadConversionRule.evaluate(ctx(20, 2, 0.1), NOW)?.severity).toBe("WARNING");
  });

  it("escalates to CRITICAL below the critical rate", () => {
    expect(weakLeadConversionRule.evaluate(ctx(20, 0, 0.02), NOW)?.severity).toBe("CRITICAL");
  });
});

describe("stagnantPipelineRule", () => {
  function ctx(totalLeads: number, activeLeads: number) {
    return contextFrom({
      crm: {
        totalCustomers: 0,
        totalLeads,
        activeLeads,
        leadsByStatus: { new: 0, contacted: 0, qualified: 0, negotiating: 0, won: 0, lost: 0 },
        wonLeads: 0,
        lostLeads: 0,
      },
    });
  }

  it("does not trigger below the minimum lead sample", () => {
    expect(stagnantPipelineRule.evaluate(ctx(5, 5), NOW)).toBeNull();
  });

  it("does not trigger below the warning active-ratio", () => {
    expect(stagnantPipelineRule.evaluate(ctx(20, 10), NOW)).toBeNull(); // 50%
  });

  it("triggers WARNING at/above the warning ratio", () => {
    expect(stagnantPipelineRule.evaluate(ctx(20, 14), NOW)?.severity).toBe("WARNING"); // 70%
  });

  it("escalates to CRITICAL at/above the critical ratio", () => {
    expect(stagnantPipelineRule.evaluate(ctx(20, 17), NOW)?.severity).toBe("CRITICAL"); // 85%
  });
});

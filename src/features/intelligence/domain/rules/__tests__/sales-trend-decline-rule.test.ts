import { describe, expect, it } from "vitest";

import { contextFrom } from "../../__tests__/fixtures";
import { salesTrendDeclineRule } from "../sales-trend-decline-rule";
import type { SalesTrendPoint } from "../../../../analytics/domain/metrics";

const NOW = "2026-09-02T12:00:00.000Z";

function point(grossValue: number, periodLabel = "period"): SalesTrendPoint {
  return { periodStart: "2026-08-01T00:00:00.000Z", periodLabel, salesCount: 1, grossValue };
}

describe("salesTrendDeclineRule", () => {
  it("does not trigger with insufficient history (fewer than 3 buckets)", () => {
    const context = contextFrom({ salesTrend: [point(1_000_000), point(200_000)] });
    expect(salesTrendDeclineRule.evaluate(context, NOW)).toBeNull();
  });

  it("does not trigger when the prior average is zero (no history to decline from)", () => {
    const context = contextFrom({ salesTrend: [point(0), point(0), point(500_000)] });
    expect(salesTrendDeclineRule.evaluate(context, NOW)).toBeNull();
  });

  it("does not trigger on ordinary variation (ratio above warning threshold)", () => {
    // prior average 1,000,000; latest 600,000 -> ratio 0.6, above 0.5 warning threshold
    const context = contextFrom({ salesTrend: [point(1_000_000), point(1_000_000), point(600_000)] });
    expect(salesTrendDeclineRule.evaluate(context, NOW)).toBeNull();
  });

  it("triggers WARNING just below the warning ratio", () => {
    // prior average 1,000,000; latest 490,000 -> ratio 0.49
    const context = contextFrom({ salesTrend: [point(1_000_000), point(1_000_000), point(490_000)] });
    expect(salesTrendDeclineRule.evaluate(context, NOW)?.severity).toBe("WARNING");
  });

  it("escalates to CRITICAL below the critical ratio", () => {
    // prior average 1,000,000; latest 200,000 -> ratio 0.2
    const context = contextFrom({ salesTrend: [point(1_000_000), point(1_000_000), point(200_000, "Sep 2026")] });
    const signal = salesTrendDeclineRule.evaluate(context, NOW);
    expect(signal?.severity).toBe("CRITICAL");
    expect(signal?.title).toContain("Sep 2026");
  });

  it("is deterministic", () => {
    const context = contextFrom({ salesTrend: [point(1_000_000), point(1_000_000), point(200_000)] });
    expect(salesTrendDeclineRule.evaluate(context, NOW)).toEqual(salesTrendDeclineRule.evaluate(context, NOW));
  });
});

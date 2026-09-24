import { describe, expect, it } from "vitest";

import { contextFrom } from "../../__tests__/fixtures";
import { completedDealsAwaitingSaleRule } from "../completed-deals-awaiting-sale-rule";

const NOW = "2026-09-02T12:00:00.000Z";

describe("completedDealsAwaitingSaleRule", () => {
  it("does not trigger at zero (below threshold)", () => {
    const context = contextFrom({ integrity: { completedDealsAwaitingSale: 0 } });
    expect(completedDealsAwaitingSaleRule.evaluate(context, NOW)).toBeNull();
  });

  it("triggers WARNING exactly at the warning threshold (1)", () => {
    const context = contextFrom({ integrity: { completedDealsAwaitingSale: 1 } });
    const signal = completedDealsAwaitingSaleRule.evaluate(context, NOW);
    expect(signal?.severity).toBe("WARNING");
    expect(signal?.type).toBe("completed_deals_awaiting_sale");
  });

  it("stays WARNING just below the critical threshold (2)", () => {
    const context = contextFrom({ integrity: { completedDealsAwaitingSale: 2 } });
    expect(completedDealsAwaitingSaleRule.evaluate(context, NOW)?.severity).toBe("WARNING");
  });

  it("escalates to CRITICAL exactly at the critical threshold (3)", () => {
    const context = contextFrom({ integrity: { completedDealsAwaitingSale: 3 } });
    expect(completedDealsAwaitingSaleRule.evaluate(context, NOW)?.severity).toBe("CRITICAL");
  });

  it("carries correct evidence and timeRange", () => {
    const context = contextFrom({ integrity: { completedDealsAwaitingSale: 5 } });
    const signal = completedDealsAwaitingSaleRule.evaluate(context, NOW)!;
    expect(signal.evidence[0].observedValue).toBe(5);
    expect(signal.timeRange).toBe(context.dateRange);
    expect(signal.triggeredAt).toBe(NOW);
    expect(signal.confidence).toEqual({ kind: "deterministic" });
  });

  it("is deterministic — same context, same result", () => {
    const context = contextFrom({ integrity: { completedDealsAwaitingSale: 4 } });
    const a = completedDealsAwaitingSaleRule.evaluate(context, NOW);
    const b = completedDealsAwaitingSaleRule.evaluate(context, NOW);
    expect(a).toEqual(b);
  });
});

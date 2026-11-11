import { describe, expect, it } from "vitest";

import { composeOperationalResult } from "../operational-result";
import { LAST_30_RANGE, signal } from "./fixtures";
import type { Recommendation } from "../recommendation";

const NOW = "2026-09-02T12:00:00.000Z";

function recommendation(priority: Recommendation["priority"], type: Recommendation["type"] = "review_overdue_follow_ups"): Recommendation {
  return {
    id: type,
    type,
    title: "t",
    summary: "s",
    rationale: "r",
    priority,
    evidence: [],
    affectedEntities: [],
    suggestedAction: { label: "Review", href: null },
    sourceSignal: "overdue_follow_up_pressure",
    timeRange: LAST_30_RANGE,
    confidence: { kind: "deterministic" },
    generatedAt: NOW,
  };
}

describe("composeOperationalResult", () => {
  it("produces an empty summary with null highestPriority when there are no recommendations", () => {
    const result = composeOperationalResult(LAST_30_RANGE, [], [], NOW);
    expect(result.summary.totalRecommendations).toBe(0);
    expect(result.summary.highestPriority).toBeNull();
    expect(result.summary.byPriority).toEqual({ LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 });
  });

  it("counts recommendations by priority and reports totalSignals independently", () => {
    const signals = [signal("overdue_follow_up_pressure", "WARNING"), signal("declining_sales_trend", "CRITICAL")];
    const recommendations = [recommendation("HIGH"), recommendation("URGENT", "review_sales_decline"), recommendation("HIGH", "review_stagnant_pipeline")];
    const result = composeOperationalResult(LAST_30_RANGE, signals, recommendations, NOW);
    expect(result.summary.totalSignals).toBe(2);
    expect(result.summary.totalRecommendations).toBe(3);
    expect(result.summary.byPriority).toEqual({ LOW: 0, MEDIUM: 0, HIGH: 2, URGENT: 1 });
  });

  it("reports the highest priority present regardless of input order", () => {
    const result = composeOperationalResult(LAST_30_RANGE, [], [recommendation("LOW"), recommendation("URGENT", "complete_deal_sale_records")], NOW);
    expect(result.summary.highestPriority).toBe("URGENT");
  });

  it("carries the given dateRange and generatedAt through unchanged", () => {
    const result = composeOperationalResult(LAST_30_RANGE, [], [], NOW);
    expect(result.timeRange).toEqual(LAST_30_RANGE);
    expect(result.generatedAt).toBe(NOW);
  });
});

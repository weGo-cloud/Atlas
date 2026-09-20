import { describe, expect, it } from "vitest";

import { composeDecisionResult } from "../result";
import { LAST_30_RANGE, recommendation } from "./fixtures";
import type { Decision } from "../decision";

const NOW = "2026-09-02T12:00:00.000Z";

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "d1",
    title: "t",
    summary: "s",
    category: "FOLLOW_UP",
    priority: "MEDIUM",
    score: 200,
    rationale: "r",
    evidence: [],
    predictive: { available: [], unavailableCount: 0 },
    sourceRecommendations: ["review_overdue_follow_ups"],
    affectedEntities: [],
    suggestedAction: { label: "Review", href: null },
    generatedAt: NOW,
    confidence: { kind: "deterministic" },
    ...overrides,
  };
}

describe("composeDecisionResult", () => {
  it("produces a zeroed summary for an empty decision list", () => {
    const result = composeDecisionResult(LAST_30_RANGE, [], [], [], NOW);
    expect(result.summary).toEqual({
      totalDecisions: 0,
      byPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 },
      withPredictiveEvidence: 0,
      withUnavailablePredictiveEvidence: 0,
    });
  });

  it("counts decisions by priority", () => {
    const result = composeDecisionResult(
      LAST_30_RANGE,
      [decision({ priority: "URGENT" }), decision({ priority: "URGENT" }), decision({ priority: "LOW" })],
      [],
      [],
      NOW
    );
    expect(result.summary.byPriority).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 0, URGENT: 2 });
  });

  it("counts decisions with available predictive evidence separately from unavailable", () => {
    const withPrediction = decision({
      predictive: { available: [{ entityId: "lead_1", entityType: "lead", entityLabel: "L", probability: 0.5, class: "positive", modelVersion: "v1" }], unavailableCount: 0 },
    });
    const withUnavailable = decision({ predictive: { available: [], unavailableCount: 2 } });
    const withNeither = decision({ predictive: { available: [], unavailableCount: 0 } });

    const result = composeDecisionResult(LAST_30_RANGE, [withPrediction, withUnavailable, withNeither], [], [], NOW);
    expect(result.summary.withPredictiveEvidence).toBe(1);
    expect(result.summary.withUnavailablePredictiveEvidence).toBe(1);
    expect(result.summary.totalDecisions).toBe(3);
  });

  it("carries the given dateRange and generatedAt through unchanged", () => {
    const result = composeDecisionResult(LAST_30_RANGE, [], [], [], NOW);
    expect(result.timeRange).toEqual(LAST_30_RANGE);
    expect(result.generatedAt).toBe(NOW);
  });

  it("carries recommendations and signals through unchanged from the operational result", () => {
    const rec = recommendation("review_overdue_follow_ups", "HIGH");
    const result = composeDecisionResult(LAST_30_RANGE, [], [rec], [], NOW);
    expect(result.recommendations).toEqual([rec]);
    expect(result.signals).toEqual([]);
  });
});

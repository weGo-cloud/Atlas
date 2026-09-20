import { describe, expect, it } from "vitest";

import { computeDecisionScore, maxAvailableProbability, MAX_PREDICTIVE_BONUS, MULTI_ENTITY_BONUS, PRIORITY_BASE_SCORE } from "../scoring";
import type { DecisionPredictiveEvidence } from "../decision";

function prediction(probability: number, entityId = "lead_1"): DecisionPredictiveEvidence {
  return { entityId, entityType: "lead", entityLabel: "Lead", probability, class: probability >= 0.5 ? "positive" : "negative", modelVersion: "lead-conversion-v1" };
}

describe("maxAvailableProbability", () => {
  it("returns null for an empty list", () => {
    expect(maxAvailableProbability([])).toBeNull();
  });

  it("returns the maximum probability across available predictions", () => {
    expect(maxAvailableProbability([prediction(0.3), prediction(0.8), prediction(0.5)])).toBe(0.8);
  });
});

describe("computeDecisionScore", () => {
  it("uses PRIORITY_BASE_SCORE as the base for each tier", () => {
    expect(computeDecisionScore("LOW", [], 0)).toBe(PRIORITY_BASE_SCORE.LOW);
    expect(computeDecisionScore("MEDIUM", [], 0)).toBe(PRIORITY_BASE_SCORE.MEDIUM);
    expect(computeDecisionScore("HIGH", [], 0)).toBe(PRIORITY_BASE_SCORE.HIGH);
    expect(computeDecisionScore("URGENT", [], 0)).toBe(PRIORITY_BASE_SCORE.URGENT);
  });

  it("contributes 0 predictive bonus when there is no available evidence (never a penalty)", () => {
    expect(computeDecisionScore("MEDIUM", [], 3)).toBe(PRIORITY_BASE_SCORE.MEDIUM + MULTI_ENTITY_BONUS);
  });

  it("adds a bounded, rounded predictive bonus proportional to the max available probability", () => {
    const score = computeDecisionScore("MEDIUM", [prediction(1.0)], 0);
    expect(score).toBe(PRIORITY_BASE_SCORE.MEDIUM + MAX_PREDICTIVE_BONUS);
  });

  it("adds the multi-entity bonus only at 2+ affected entities", () => {
    expect(computeDecisionScore("LOW", [], 1)).toBe(PRIORITY_BASE_SCORE.LOW);
    expect(computeDecisionScore("LOW", [], 2)).toBe(PRIORITY_BASE_SCORE.LOW + MULTI_ENTITY_BONUS);
  });

  it("guarantees tier separation — no combination of bonuses lets a lower tier outrank a higher one", () => {
    const maxPossibleLowScore = computeDecisionScore("LOW", [prediction(1.0)], 100);
    const minPossibleMediumScore = computeDecisionScore("MEDIUM", [], 0);
    expect(maxPossibleLowScore).toBeLessThan(minPossibleMediumScore);

    const maxPossibleMediumScore = computeDecisionScore("MEDIUM", [prediction(1.0)], 100);
    const minPossibleHighScore = computeDecisionScore("HIGH", [], 0);
    expect(maxPossibleMediumScore).toBeLessThan(minPossibleHighScore);

    const maxPossibleHighScore = computeDecisionScore("HIGH", [prediction(1.0)], 100);
    const minPossibleUrgentScore = computeDecisionScore("URGENT", [], 0);
    expect(maxPossibleHighScore).toBeLessThan(minPossibleUrgentScore);
  });

  it("is deterministic for identical inputs", () => {
    const a = computeDecisionScore("HIGH", [prediction(0.72)], 3);
    const b = computeDecisionScore("HIGH", [prediction(0.72)], 3);
    expect(a).toBe(b);
  });
});

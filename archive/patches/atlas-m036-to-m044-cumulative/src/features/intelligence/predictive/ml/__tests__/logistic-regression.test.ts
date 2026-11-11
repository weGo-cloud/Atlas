import { describe, expect, it } from "vitest";

import { trainLogisticRegression, predictProbability, featureContributions } from "../logistic-regression";
import type { LabeledVector } from "../logistic-regression";

function makeSeparableExamples(): LabeledVector[] {
  // Single feature, cleanly separable: feature < 0 -> label 0, feature > 0 -> label 1.
  const examples: LabeledVector[] = [];
  for (let i = 1; i <= 20; i++) {
    examples.push({ features: [-i], label: 0 });
    examples.push({ features: [i], label: 1 });
  }
  return examples;
}

describe("trainLogisticRegression / predictProbability", () => {
  it("learns a positive weight on a feature that's positively correlated with the label", () => {
    const model = trainLogisticRegression(makeSeparableExamples(), ["x"]);
    expect(model.weights[0]).toBeGreaterThan(0);
  });

  it("predicts higher probability for examples resembling the positive class", () => {
    const model = trainLogisticRegression(makeSeparableExamples(), ["x"]);
    const highProb = predictProbability(model, [15]);
    const lowProb = predictProbability(model, [-15]);
    expect(highProb).toBeGreaterThan(0.5);
    expect(lowProb).toBeLessThan(0.5);
    expect(highProb).toBeGreaterThan(lowProb);
  });

  it("always returns a probability in [0, 1], never NaN/Infinity", () => {
    const model = trainLogisticRegression(makeSeparableExamples(), ["x"]);
    for (const x of [-1000, -1, 0, 1, 1000]) {
      const p = predictProbability(model, [x]);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic — identical examples train to an identical model", () => {
    const examples = makeSeparableExamples();
    const a = trainLogisticRegression(examples, ["x"]);
    const b = trainLogisticRegression(examples, ["x"]);
    expect(a).toEqual(b);
  });

  it("handles a constant feature (zero variance) without NaN weights", () => {
    const examples: LabeledVector[] = [
      { features: [5, 1], label: 0 },
      { features: [5, 10], label: 1 },
      { features: [5, 2], label: 0 },
      { features: [5, 9], label: 1 },
    ];
    const model = trainLogisticRegression(examples, ["constant", "varies"]);
    expect(Number.isFinite(model.weights[0])).toBe(true);
    expect(Number.isFinite(model.weights[1])).toBe(true);
  });

  it("featureContributions attributes more of the score to a more predictive feature", () => {
    const examples: LabeledVector[] = makeSeparableExamples().map((ex) => ({
      features: [ex.features[0], 0], // second feature is always 0 — no signal
      label: ex.label,
    }));
    const model = trainLogisticRegression(examples, ["signal", "noise"]);
    const contributions = featureContributions(model, [15, 0]);
    expect(Math.abs(contributions[0])).toBeGreaterThan(Math.abs(contributions[1]));
  });
});

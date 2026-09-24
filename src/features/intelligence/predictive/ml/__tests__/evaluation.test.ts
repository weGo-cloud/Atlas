import { describe, expect, it } from "vitest";

import { rocAuc, prAuc, confusionMatrix, precisionRecallF1, logLoss, brierScore } from "../evaluation";
import type { ScoredExample } from "../evaluation";

describe("rocAuc", () => {
  it("returns 1.0 for perfect separation", () => {
    const examples: ScoredExample[] = [
      { score: 0.9, label: 1 },
      { score: 0.8, label: 1 },
      { score: 0.2, label: 0 },
      { score: 0.1, label: 0 },
    ];
    expect(rocAuc(examples)).toBe(1);
  });

  it("returns 0.5 for a completely uninformative (tied) score", () => {
    const examples: ScoredExample[] = [
      { score: 0.5, label: 1 },
      { score: 0.5, label: 1 },
      { score: 0.5, label: 0 },
      { score: 0.5, label: 0 },
    ];
    expect(rocAuc(examples)).toBe(0.5);
  });

  it("returns 0.0 for perfectly inverted scoring", () => {
    const examples: ScoredExample[] = [
      { score: 0.1, label: 1 },
      { score: 0.9, label: 0 },
    ];
    expect(rocAuc(examples)).toBe(0);
  });

  it("returns NaN when only one class is present (undefined, not fabricated)", () => {
    const examples: ScoredExample[] = [
      { score: 0.5, label: 1 },
      { score: 0.9, label: 1 },
    ];
    expect(Number.isNaN(rocAuc(examples))).toBe(true);
  });
});

describe("confusionMatrix / precisionRecallF1", () => {
  it("computes exact counts at a given threshold", () => {
    const examples: ScoredExample[] = [
      { score: 0.9, label: 1 }, // TP
      { score: 0.6, label: 0 }, // FP
      { score: 0.3, label: 0 }, // TN
      { score: 0.2, label: 1 }, // FN
    ];
    const matrix = confusionMatrix(examples, 0.5);
    expect(matrix).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
    const { precision, recall, f1 } = precisionRecallF1(matrix);
    expect(precision).toBeCloseTo(0.5);
    expect(recall).toBeCloseTo(0.5);
    expect(f1).toBeCloseTo(0.5);
  });

  it("handles zero predicted-positive without dividing by zero", () => {
    const matrix = confusionMatrix([{ score: 0.1, label: 1 }], 0.5);
    const { precision, f1 } = precisionRecallF1(matrix);
    expect(precision).toBe(0);
    expect(f1).toBe(0);
  });
});

describe("prAuc", () => {
  it("returns close to 1.0 for perfect separation", () => {
    const examples: ScoredExample[] = [
      { score: 0.9, label: 1 },
      { score: 0.8, label: 1 },
      { score: 0.2, label: 0 },
      { score: 0.1, label: 0 },
    ];
    expect(prAuc(examples)).toBeCloseTo(1, 1);
  });

  it("returns NaN when there are no positive examples", () => {
    expect(Number.isNaN(prAuc([{ score: 0.5, label: 0 }]))).toBe(true);
  });
});

describe("logLoss", () => {
  it("is near zero for confident, correct predictions", () => {
    const examples: ScoredExample[] = [
      { score: 0.99, label: 1 },
      { score: 0.01, label: 0 },
    ];
    expect(logLoss(examples)).toBeLessThan(0.02);
  });

  it("is high for confident, wrong predictions", () => {
    const examples: ScoredExample[] = [
      { score: 0.01, label: 1 },
      { score: 0.99, label: 0 },
    ];
    expect(logLoss(examples)).toBeGreaterThan(4);
  });

  it("never returns NaN or Infinity even at the extremes (0 or 1)", () => {
    const examples: ScoredExample[] = [
      { score: 1, label: 1 },
      { score: 0, label: 0 },
    ];
    const value = logLoss(examples);
    expect(Number.isFinite(value)).toBe(true);
  });
});

describe("brierScore", () => {
  it("is 0 for perfect predictions", () => {
    expect(
      brierScore([
        { score: 1, label: 1 },
        { score: 0, label: 0 },
      ])
    ).toBe(0);
  });

  it("is 1 for perfectly wrong predictions", () => {
    expect(
      brierScore([
        { score: 0, label: 1 },
        { score: 1, label: 0 },
      ])
    ).toBe(1);
  });

  it("is 0.25 for an uninformative 0.5 prediction", () => {
    expect(
      brierScore([
        { score: 0.5, label: 1 },
        { score: 0.5, label: 0 },
      ])
    ).toBeCloseTo(0.25);
  });
});

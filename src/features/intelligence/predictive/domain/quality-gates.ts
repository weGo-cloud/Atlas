/**
 * Mission 023 — Section 16. A model earns production status by
 * passing every gate below, in order — training succeeding is not
 * enough (Section 16: "a model should not become user-facing merely
 * because training succeeded"). Generic over any binary-classification
 * target, so a future M023.x target (vehicle movement, deal
 * completion) reuses this instead of a copy with its own thresholds
 * hard-coded inline.
 */
export type QualityGateThresholds = {
  /** Below this many total labeled examples, no split is trustworthy — reject before even attempting a split. */
  minObservations: number;
  /** Both classes need real representation, or the model just learns to predict the majority class. */
  minPositiveExamples: number;
  minNegativeExamples: number;
  /** The held-out test set itself needs enough examples that its metrics aren't noise. */
  minTestObservations: number;
  /** The model's ROC-AUC must beat the baseline's by at least this margin — "provides useful predictive value beyond the baseline" (Section 11), not just "trained without erroring". */
  minRocAucImprovementOverBaseline: number;
  /** A ceiling on Brier score (lower is better-calibrated) — a model that discriminates well but is badly miscalibrated fails here (Section 14: discrimination ≠ calibration). */
  maxBrierScore: number;
};

export type QualityGateInput = {
  totalObservations: number;
  positiveExamples: number;
  negativeExamples: number;
  testObservations: number;
  modelRocAuc: number;
  baselineRocAuc: number;
  modelBrierScore: number;
};

export type QualityGateResult =
  | { passed: true }
  | {
      passed: false;
      /** Which gate failed first — gates are checked in a fixed order and evaluation stops at the first failure, so this always names the actual blocking reason, never a downstream symptom of it. */
      failedGate:
        | "insufficient_observations"
        | "insufficient_positive_examples"
        | "insufficient_negative_examples"
        | "insufficient_test_observations"
        | "does_not_beat_baseline"
        | "poor_calibration";
      detail: string;
    };

export function evaluateQualityGates(input: QualityGateInput, thresholds: QualityGateThresholds): QualityGateResult {
  if (input.totalObservations < thresholds.minObservations) {
    return {
      passed: false,
      failedGate: "insufficient_observations",
      detail: `${input.totalObservations} labeled examples available, ${thresholds.minObservations} required.`,
    };
  }
  if (input.positiveExamples < thresholds.minPositiveExamples) {
    return {
      passed: false,
      failedGate: "insufficient_positive_examples",
      detail: `${input.positiveExamples} positive examples available, ${thresholds.minPositiveExamples} required.`,
    };
  }
  if (input.negativeExamples < thresholds.minNegativeExamples) {
    return {
      passed: false,
      failedGate: "insufficient_negative_examples",
      detail: `${input.negativeExamples} negative examples available, ${thresholds.minNegativeExamples} required.`,
    };
  }
  if (input.testObservations < thresholds.minTestObservations) {
    return {
      passed: false,
      failedGate: "insufficient_test_observations",
      detail: `${input.testObservations} test-set examples available, ${thresholds.minTestObservations} required.`,
    };
  }
  if (input.modelRocAuc - input.baselineRocAuc < thresholds.minRocAucImprovementOverBaseline) {
    return {
      passed: false,
      failedGate: "does_not_beat_baseline",
      detail: `Model ROC-AUC ${input.modelRocAuc.toFixed(3)} vs baseline ${input.baselineRocAuc.toFixed(3)} — required improvement ${thresholds.minRocAucImprovementOverBaseline}.`,
    };
  }
  if (input.modelBrierScore > thresholds.maxBrierScore) {
    return {
      passed: false,
      failedGate: "poor_calibration",
      detail: `Brier score ${input.modelBrierScore.toFixed(3)} exceeds the ${thresholds.maxBrierScore} ceiling.`,
    };
  }
  return { passed: true };
}

import type { ScoredExample } from "./evaluation";

/**
 * Mission 023 — Section 15. Deliberately just a binned calibration
 * curve plus Brier score (already in evaluation.ts) — no Platt
 * scaling or isotonic regression fit. Section 15's own instruction is
 * "use only methods justified by the available data" and "do not
 * overfit the calibration process": fitting a second model (Platt/
 * isotonic) on top of an already-small validation set to correct a
 * first model trained on an even smaller training set multiplies the
 * overfitting risk without the data to support it. A calibration
 * *curve* costs nothing to overfit — it just reports the bins as
 * they are — which is why it's the only calibration method used
 * here; if a future mission has enough data to justify a proper
 * recalibration fit, it can be added as a documented option then.
 */
export type CalibrationBin = {
  binStart: number;
  binEnd: number;
  count: number;
  /** Mean predicted probability of examples in this bin — undefined (bin empty) is reported as null, never 0, since 0 would misleadingly look like a real prediction. */
  meanPredicted: number | null;
  observedRate: number | null;
};

export function calibrationCurve(examples: ScoredExample[], binCount = 10): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  const width = 1 / binCount;

  for (let i = 0; i < binCount; i++) {
    const binStart = i * width;
    const binEnd = i === binCount - 1 ? 1 : (i + 1) * width;
    const inBin = examples.filter((ex) => (i === binCount - 1 ? ex.score >= binStart && ex.score <= binEnd : ex.score >= binStart && ex.score < binEnd));

    bins.push({
      binStart,
      binEnd,
      count: inBin.length,
      meanPredicted: inBin.length > 0 ? inBin.reduce((sum, ex) => sum + ex.score, 0) / inBin.length : null,
      observedRate: inBin.length > 0 ? inBin.reduce((sum, ex) => sum + ex.label, 0) / inBin.length : null,
    });
  }

  return bins;
}

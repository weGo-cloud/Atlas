/**
 * Mission 023 — Section 14. Accuracy alone is explicitly ruled out.
 * Every function here is a pure, deterministic computation over
 * (score, label) pairs — no fitting, no randomness — so the same
 * predictions always produce the same reported metrics.
 */
export type ScoredExample = { score: number; label: 0 | 1 };

/**
 * ROC-AUC via the Mann-Whitney U equivalence: the probability that a
 * randomly chosen positive scores higher than a randomly chosen
 * negative (ties count as half a win). Rank-based, so it needs no
 * threshold and is insensitive to monotonic score rescaling —
 * exactly the "discrimination" half of Section 14's
 * discrimination-vs-calibration distinction.
 */
export function rocAuc(examples: ScoredExample[]): number {
  const positives = examples.filter((e) => e.label === 1);
  const negatives = examples.filter((e) => e.label === 0);
  if (positives.length === 0 || negatives.length === 0) return NaN;

  let wins = 0;
  for (const pos of positives) {
    for (const neg of negatives) {
      if (pos.score > neg.score) wins += 1;
      else if (pos.score === neg.score) wins += 0.5;
    }
  }
  return wins / (positives.length * negatives.length);
}

export function confusionMatrix(examples: ScoredExample[], threshold: number) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const ex of examples) {
    const predicted = ex.score >= threshold ? 1 : 0;
    if (predicted === 1 && ex.label === 1) tp += 1;
    else if (predicted === 1 && ex.label === 0) fp += 1;
    else if (predicted === 0 && ex.label === 0) tn += 1;
    else fn += 1;
  }
  return { tp, fp, tn, fn };
}

export function precisionRecallF1(matrix: { tp: number; fp: number; tn: number; fn: number }) {
  const precision = matrix.tp + matrix.fp > 0 ? matrix.tp / (matrix.tp + matrix.fp) : 0;
  const recall = matrix.tp + matrix.fn > 0 ? matrix.tp / (matrix.tp + matrix.fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

/**
 * Precision-recall AUC via trapezoidal integration over every
 * distinct score used as a threshold — deliberately not a smoothed
 * fit, so it never reports better performance than the raw
 * precision/recall pairs actually support.
 */
export function prAuc(examples: ScoredExample[]): number {
  const positives = examples.filter((e) => e.label === 1).length;
  if (positives === 0) return NaN;

  const thresholds = [...new Set(examples.map((e) => e.score))].sort((a, b) => b - a);
  const points: { recall: number; precision: number }[] = [{ recall: 0, precision: 1 }];
  for (const t of thresholds) {
    const matrix = confusionMatrix(examples, t);
    const { precision, recall } = precisionRecallF1(matrix);
    points.push({ recall, precision });
  }

  points.sort((a, b) => a.recall - b.recall);
  let area = 0;
  for (let i = 1; i < points.length; i++) {
    const width = points[i].recall - points[i - 1].recall;
    const avgHeight = (points[i].precision + points[i - 1].precision) / 2;
    area += width * avgHeight;
  }
  return area;
}

const LOG_LOSS_EPSILON = 1e-15;

/** Clamped to avoid -Infinity when a prediction is exactly 0 or 1 — Section 31's "no NaN/Infinity" requirement. */
export function logLoss(examples: ScoredExample[]): number {
  if (examples.length === 0) return NaN;
  let sum = 0;
  for (const ex of examples) {
    const p = Math.min(1 - LOG_LOSS_EPSILON, Math.max(LOG_LOSS_EPSILON, ex.score));
    sum += ex.label === 1 ? -Math.log(p) : -Math.log(1 - p);
  }
  return sum / examples.length;
}

/** Mean squared error between predicted probability and actual binary outcome — the headline calibration-sensitive metric (Section 15). */
export function brierScore(examples: ScoredExample[]): number {
  if (examples.length === 0) return NaN;
  const sum = examples.reduce((acc, ex) => acc + (ex.score - ex.label) ** 2, 0);
  return sum / examples.length;
}

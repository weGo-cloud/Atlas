/**
 * Mission 023 — Section 10. Chronological split, never a random one
 * — the caller must pass examples already sorted oldest-first
 * (verified defensively below), and the split is a straight index
 * cut: earliest examples → train, next → validation, most recent →
 * test. This guarantees the model is always evaluated on data that
 * came *after* everything it trained on, matching how it would
 * actually be used in production (predicting forward in time, never
 * backward).
 */
export type TemporalSplitRatios = { train: number; validation: number; test: number };

export const DEFAULT_TEMPORAL_SPLIT_RATIOS: TemporalSplitRatios = { train: 0.6, validation: 0.2, test: 0.2 };

export type TemporalSplit<T> = { train: T[]; validation: T[]; test: T[] };

export function splitTemporal<T>(
  examplesOldestFirst: T[],
  getSortKey: (item: T) => string,
  ratios: TemporalSplitRatios = DEFAULT_TEMPORAL_SPLIT_RATIOS
): TemporalSplit<T> {
  for (let i = 1; i < examplesOldestFirst.length; i++) {
    if (getSortKey(examplesOldestFirst[i]) < getSortKey(examplesOldestFirst[i - 1])) {
      throw new Error("splitTemporal requires examples sorted oldest-first — found an out-of-order pair.");
    }
  }

  const n = examplesOldestFirst.length;
  const trainEnd = Math.floor(n * ratios.train);
  const validationEnd = trainEnd + Math.floor(n * ratios.validation);

  return {
    train: examplesOldestFirst.slice(0, trainEnd),
    validation: examplesOldestFirst.slice(trainEnd, validationEnd),
    test: examplesOldestFirst.slice(validationEnd),
  };
}

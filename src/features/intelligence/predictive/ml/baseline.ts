/**
 * Mission 023 — Section 11. The mandatory baseline: predict the
 * training set's overall positive rate for every example, regardless
 * of features. Any real model must beat this by a meaningful margin
 * (enforced in quality-gates.ts) or it isn't earning its complexity —
 * a model that only matches "guess the historical rate" provides no
 * value a single stored number wouldn't already provide.
 */
export type BaselineModel = { positiveRate: number };

export function trainBaseline(labels: (0 | 1)[]): BaselineModel {
  if (labels.length === 0) throw new Error("Cannot train a baseline on zero examples.");
  const positiveRate = labels.reduce((sum: number, l) => sum + l, 0) / labels.length;
  return { positiveRate };
}

export function predictBaseline(model: BaselineModel): number {
  return model.positiveRate;
}

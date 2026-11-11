/**
 * Mission 023 — Section 12. A deliberately simple, interpretable
 * model: L2-regularized logistic regression trained with batch
 * gradient descent, implemented directly in TypeScript rather than
 * shelling out to Python/sklearn. Section 22 warns against premature
 * infrastructure, and Section 23 requires training/inference to stay
 * cleanly separated — a pure-TS model keeps both inside the existing
 * Atlas runtime with no subprocess, no serialization boundary
 * between two languages, and (per Section 12) "if logistic
 * regression performs adequately, prefer it over a more complex
 * model" is exactly the evidence-based default this project's current
 * data volume calls for.
 *
 * Fully deterministic: weights always start at zero (never randomly
 * initialized), gradient descent runs a fixed iteration count, and
 * there is no sampling anywhere in training or inference — same
 * examples in, same model out, every time (Section 15's "no
 * randomness").
 */
export type LogisticRegressionModel = {
  featureNames: string[];
  /** z-score standardization stats from the *training* set only — inference standardizes new features against these, never recomputed at inference time (that would let inference-time data leak into what's supposedly a frozen, versioned model). */
  featureMeans: number[];
  featureStds: number[];
  weights: number[];
  bias: number;
};

export type LabeledVector = { features: number[]; label: 0 | 1 };

export type LogisticRegressionOptions = {
  learningRate: number;
  iterations: number;
  /** L2 penalty strength — kept meaningful specifically because training sets here are small; without it, a handful of examples can drive a weight to an extreme value. */
  l2: number;
};

export const DEFAULT_LOGISTIC_REGRESSION_OPTIONS: LogisticRegressionOptions = {
  learningRate: 0.1,
  iterations: 500,
  l2: 0.01,
};

function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function standardize(value: number, mean: number, std: number): number {
  return std > 0 ? (value - mean) / std : 0;
}

export function trainLogisticRegression(
  examples: LabeledVector[],
  featureNames: string[],
  options: LogisticRegressionOptions = DEFAULT_LOGISTIC_REGRESSION_OPTIONS
): LogisticRegressionModel {
  const n = examples.length;
  const d = featureNames.length;
  if (n === 0) throw new Error("Cannot train logistic regression on zero examples.");

  const featureMeans = new Array(d).fill(0);
  const featureStds = new Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (const ex of examples) sum += ex.features[j];
    featureMeans[j] = sum / n;
  }
  for (let j = 0; j < d; j++) {
    let sumSq = 0;
    for (const ex of examples) sumSq += (ex.features[j] - featureMeans[j]) ** 2;
    featureStds[j] = Math.sqrt(sumSq / n);
  }

  const standardized = examples.map((ex) => ({
    features: ex.features.map((v, j) => standardize(v, featureMeans[j], featureStds[j])),
    label: ex.label,
  }));

  const weights = new Array(d).fill(0);
  let bias = 0;

  for (let iter = 0; iter < options.iterations; iter++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (const ex of standardized) {
      const z = ex.features.reduce((sum, v, j) => sum + v * weights[j], bias);
      const prediction = sigmoid(z);
      const error = prediction - ex.label;
      for (let j = 0; j < d; j++) gradW[j] += error * ex.features[j];
      gradB += error;
    }

    for (let j = 0; j < d; j++) {
      const regularized = gradW[j] / n + options.l2 * weights[j];
      weights[j] -= options.learningRate * regularized;
    }
    bias -= options.learningRate * (gradB / n);
  }

  return { featureNames, featureMeans, featureStds, weights, bias };
}

export function predictProbability(model: LogisticRegressionModel, features: number[]): number {
  const standardized = features.map((v, j) => standardize(v, model.featureMeans[j], model.featureStds[j]));
  const z = standardized.reduce((sum, v, j) => sum + v * model.weights[j], model.bias);
  return sigmoid(z);
}

/** Signed contribution of each feature to the linear score, in standardized units — the direct, non-invented basis for PredictionEvidenceFactor.contribution (Section 18). */
export function featureContributions(model: LogisticRegressionModel, features: number[]): number[] {
  return features.map((v, j) => {
    const standardized = standardize(v, model.featureMeans[j], model.featureStds[j]);
    return standardized * model.weights[j];
  });
}

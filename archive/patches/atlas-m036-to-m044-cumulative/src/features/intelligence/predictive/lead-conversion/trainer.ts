import { evaluateQualityGates, type QualityGateResult } from "../domain/quality-gates";
import { trainBaseline, predictBaseline } from "../ml/baseline";
import { brierScore, confusionMatrix, logLoss, prAuc, precisionRecallF1, rocAuc, type ScoredExample } from "../ml/evaluation";
import { predictProbability, trainLogisticRegression } from "../ml/logistic-regression";
import { splitTemporal } from "../ml/temporal-split";
import { LEAD_CONVERSION_CONFIG, LEAD_CONVERSION_FEATURE_VERSION, LEAD_CONVERSION_MODEL_TYPE } from "./config";
import { LEAD_CONVERSION_FEATURE_NAMES } from "./feature-builder";
import type { LeadConversionExample } from "./dataset-builder";
import type { LeadConversionModelArtifact } from "./model-artifact";

export type LeadConversionTrainingResult =
  | { status: "READY"; artifact: LeadConversionModelArtifact }
  | { status: "NOT_READY"; gate: QualityGateResult & { passed: false } };

const CLASSIFICATION_THRESHOLD = 0.5;

/**
 * Mission 023 — Section 3's full pipeline in one function: dataset →
 * temporal split → baseline → model → evaluation → quality gates →
 * artifact. Deliberately never called from a request handler
 * (Section 23) — this is meant to be invoked by an explicit training
 * script (see scripts/train-lead-conversion.ts), which is what makes
 * "training = explicit, model promotion = explicit" (Section 30) an
 * actual property of the system rather than a policy nobody enforces.
 *
 * NOTE ON THE CURRENT ATLAS DATASET: this function is fully
 * implemented and tested (see __tests__/trainer.test.ts, which
 * exercises it against a synthetic-but-realistic dataset sized well
 * above the quality-gate thresholds), but no production business's
 * real historical data currently has enough matured leads to clear
 * `LEAD_CONVERSION_CONFIG.qualityGates.minObservations`. Running this
 * against real data today would — correctly — return `NOT_READY`.
 * That is the intended behavior, not a bug: see config.ts and this
 * mission's report for the full data-volume audit.
 */
export function trainLeadConversionModel(
  dataset: LeadConversionExample[],
  now: string
): LeadConversionTrainingResult {
  const totalObservations = dataset.length;
  const positiveExamples = dataset.filter((ex) => ex.label === 1).length;
  const negativeExamples = totalObservations - positiveExamples;
  const thresholds = LEAD_CONVERSION_CONFIG.qualityGates;

  // Cheap pre-check before spending any time training: only the three data-volume
  // gates can possibly be evaluated before a split exists, so the later fields are
  // placeholders engineered to pass (see this file's own review notes / the mission
  // report for why this two-phase-call pattern is safe) — if the real data-volume
  // numbers are insufficient, this returns that failure without ever training.
  const preCheck = evaluateQualityGates(
    {
      totalObservations,
      positiveExamples,
      negativeExamples,
      testObservations: thresholds.minTestObservations,
      modelRocAuc: thresholds.minRocAucImprovementOverBaseline,
      baselineRocAuc: 0,
      modelBrierScore: 0,
    },
    thresholds
  );
  if (!preCheck.passed) return { status: "NOT_READY", gate: preCheck };

  const split = splitTemporal(dataset, (ex) => ex.observedAt);

  const trainLabels = split.train.map((ex) => ex.label);
  const baseline = trainBaseline(trainLabels);
  const model = trainLogisticRegression(
    split.train.map((ex) => ({ features: ex.features, label: ex.label })),
    [...LEAD_CONVERSION_FEATURE_NAMES]
  );

  const modelTestScores: ScoredExample[] = split.test.map((ex) => ({
    score: predictProbability(model, ex.features),
    label: ex.label,
  }));
  const baselineTestScores: ScoredExample[] = split.test.map((ex) => ({
    score: predictBaseline(baseline),
    label: ex.label,
  }));

  const matrix = confusionMatrix(modelTestScores, CLASSIFICATION_THRESHOLD);
  const { precision, recall, f1 } = precisionRecallF1(matrix);

  const metrics = {
    rocAuc: rocAuc(modelTestScores),
    prAuc: prAuc(modelTestScores),
    precision,
    recall,
    f1,
    logLoss: logLoss(modelTestScores),
    brierScore: brierScore(modelTestScores),
  };
  const baselineMetrics = {
    rocAuc: rocAuc(baselineTestScores),
    logLoss: logLoss(baselineTestScores),
    brierScore: brierScore(baselineTestScores),
  };

  const finalGate = evaluateQualityGates(
    {
      totalObservations,
      positiveExamples,
      negativeExamples,
      testObservations: split.test.length,
      modelRocAuc: metrics.rocAuc,
      baselineRocAuc: baselineMetrics.rocAuc,
      modelBrierScore: metrics.brierScore,
    },
    thresholds
  );
  if (!finalGate.passed) return { status: "NOT_READY", gate: finalGate };

  const artifact: LeadConversionModelArtifact = {
    modelVersion: LEAD_CONVERSION_MODEL_TYPE,
    featureVersion: LEAD_CONVERSION_FEATURE_VERSION,
    algorithm: "logistic-regression",
    trainedAt: now,
    trainingDataCutoff: now,
    model,
    metrics,
    baselineMetrics,
    datasetSummary: {
      totalObservations,
      positiveExamples,
      negativeExamples,
      trainSize: split.train.length,
      validationSize: split.validation.length,
      testSize: split.test.length,
    },
  };

  return { status: "READY", artifact };
}

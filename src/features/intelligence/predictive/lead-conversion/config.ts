/**
 * Mission 023 — Lead Conversion Prediction (Section 4A).
 *
 * Prediction target: "will this Lead reach a completed Deal?"
 *
 * Two distinct cutoffs, both anchored on lead.createdAt, is the core
 * leakage-prevention design (Section 9/10):
 *
 * - OBSERVATION_WINDOW_DAYS: features may only use activities whose
 *   createdAt falls within [lead.createdAt, lead.createdAt +
 *   OBSERVATION_WINDOW_DAYS]. This is "what Atlas would have known"
 *   at the moment a prediction would actually be made in production
 *   — shortly after a lead comes in, not months later.
 * - PREDICTION_HORIZON_DAYS: the label asks "did this lead reach a
 *   completed Deal by lead.createdAt + PREDICTION_HORIZON_DAYS?",
 *   using deal_created/deal_status_changed activity timestamps (not
 *   today's current Deal status) — so a Deal that completes *after*
 *   the horizon correctly labels as a negative example, exactly as a
 *   production prediction made at the observation cutoff would have
 *   had to guess without knowing that future event.
 *
 * A lead is only included in the dataset once the full horizon has
 * already elapsed (lead.createdAt <= now - PREDICTION_HORIZON_DAYS) —
 * this is what makes every label fully resolved rather than
 * right-censored (Section 4B's censoring concern applies here too: a
 * lead created yesterday that hasn't converted yet isn't "negative",
 * it's "not yet known", and is excluded rather than mislabeled).
 */
export const LEAD_CONVERSION_CONFIG = {
  observationWindowDays: 7,
  predictionHorizonDays: 30,

  /** Section 16's quality gates, tuned for this target specifically. */
  qualityGates: {
    minObservations: 100,
    minPositiveExamples: 20,
    minNegativeExamples: 20,
    minTestObservations: 15,
    minRocAucImprovementOverBaseline: 0.05,
    maxBrierScore: 0.25,
  },
} as const;

export const LEAD_CONVERSION_FEATURE_VERSION = "lead-conversion-features-v1";
export const LEAD_CONVERSION_MODEL_TYPE = "lead-conversion-v1";

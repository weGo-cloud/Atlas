/**
 * Mission 023 — Section 6/17. Every prediction Atlas can produce,
 * whatever the target, returns this shape. `status` is the load-
 * bearing field: a caller MUST check it before reading `probability`
 * — `probability`/`class`/`evidence` only exist when `status ===
 * "AVAILABLE"`. This is deliberately a discriminated union (not one
 * flat object with optional fields) so TypeScript itself enforces
 * that check at every call site — you cannot read `.probability` off
 * a `Prediction` without first narrowing on `.status`.
 *
 * Section 17 is explicit that "insufficient data" and "no
 * prediction" are not the same as "0%" or a fabricated fallback
 * score — each non-AVAILABLE status names *why* there's no
 * probability, rather than the caller having to guess.
 */
export const PREDICTION_STATUSES = [
  "AVAILABLE",
  "INSUFFICIENT_DATA",
  "MODEL_NOT_READY",
  "UNSUPPORTED",
  "ERROR",
] as const;
export type PredictionStatus = (typeof PREDICTION_STATUSES)[number];

export type PredictionEvidenceFactor = {
  /** Machine name of the underlying feature, e.g. "activityCountBeforeCutoff". */
  feature: string;
  /** Human label, e.g. "Activity in the first week". */
  label: string;
  value: number;
  /**
   * This feature's signed contribution to the prediction (positive =
   * pushed the probability up, negative = pushed it down) — for a
   * linear/logistic model this is literally `coefficient * value`,
   * not an invented explanation (Section 18: "based on actual model
   * features/evidence").
   */
  contribution: number;
};

export type ModelIdentity = {
  /** e.g. "lead-conversion-v1" — see model-version.ts. */
  modelVersion: string;
  featureVersion: string;
  trainedAt: string;
  /** ISO date — the latest data the training set could see; nothing after this informed the model. */
  trainingDataCutoff: string;
  algorithm: string;
};

type PredictionBase = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  generatedAt: string;
  /** How far into the future this prediction's outcome resolves, if the target is horizon-based (e.g. 30 for "within 30 days"). Absent for targets with no horizon. */
  horizonDays?: number;
};

export type Prediction =
  | (PredictionBase & {
      status: "AVAILABLE";
      probability: number;
      /** Binary threshold applied to `probability` for a simple yes/no read — never used in place of the probability itself. */
      class: "positive" | "negative";
      model: ModelIdentity;
      evidence: PredictionEvidenceFactor[];
    })
  | (PredictionBase & { status: "INSUFFICIENT_DATA"; reason: string })
  | (PredictionBase & { status: "MODEL_NOT_READY"; reason: string })
  | (PredictionBase & { status: "UNSUPPORTED"; reason: string })
  | (PredictionBase & { status: "ERROR"; reason: string });

import type { SignalConfidence, SignalEvidence } from "../../domain/signal";
import type { AffectedEntity, AffectedEntityType } from "../../operational/domain/affected-entity";
import type { Priority } from "../../operational/domain/priority";
import type { RecommendationType, SuggestedAction } from "../../operational/domain/recommendation";
import type { DecisionCategory } from "./category";

/**
 * Mission 024 — Section "PREDICTIVE EVIDENCE"/"LEAD PRIORITIZATION".
 * One entity's M023 prediction, carried into a Decision only once it
 * has already been confirmed `status: "AVAILABLE"` — this type has
 * no way to represent an unavailable prediction, by design (see
 * `DecisionPredictiveSummary.unavailableCount` below for how that
 * case is tracked instead). `probability` is always a genuine
 * model-derived value from M023, never computed here.
 */
export type DecisionPredictiveEvidence = {
  entityId: string;
  entityType: AffectedEntityType;
  entityLabel: string;
  probability: number;
  class: "positive" | "negative";
  modelVersion: string;
};

/**
 * Structurally separates "we have predictive evidence" from "we
 * don't" — the mission's explicit requirement that "unavailable
 * prediction ≠ low probability" is enforced by there being no field
 * here that could be mistaken for one. `unavailableCount` is reported
 * so the UI can say "predictive evidence unavailable for N leads"
 * instead of silently omitting it, but it never contributes to
 * `Decision.score` (see scoring.ts).
 */
export type DecisionPredictiveSummary = {
  available: DecisionPredictiveEvidence[];
  unavailableCount: number;
};

export type Decision = {
  /** Deterministic — see rank.ts/consolidate.ts for how this is derived, including for a consolidated decision. */
  id: string;
  title: string;
  summary: string;
  category: DecisionCategory;
  /** The dominant ranking factor — carried through from the source recommendation(s) (Section "DECISION PRIORITIZATION": "do not simply copy M022 priority" refers to the *score*, not this field; `priority` itself is deliberately the same trusted M022 value, unchanged, so it stays traceable to its source). For a consolidated decision, the highest priority among its sources. */
  priority: Priority;
  /** The full computed rank value — see scoring.ts for its bounded, documented formula. This is what decisions are actually sorted by, not `priority` alone. */
  score: number;
  /** The "why" — ties back to evidence/prediction, a predefined template, never generated prose. */
  rationale: string;
  evidence: SignalEvidence[];
  predictive: DecisionPredictiveSummary;
  /** Which M022 recommendation(s) this decision was built from — more than one only when consolidate.ts actually merged decisions that shared both a category and an affected entity. */
  sourceRecommendations: RecommendationType[];
  affectedEntities: AffectedEntity[];
  suggestedAction: SuggestedAction;
  generatedAt: string;
  /** Always `{ kind: "deterministic" }` — the same reserved-for-M023.x-model-probability pattern as Signal/Recommendation's own confidence field. */
  confidence: SignalConfidence;
};

import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { SignalConfidence, SignalEvidence, SignalType } from "../../domain/signal";
import type { AffectedEntity } from "./affected-entity";
import type { Priority } from "./priority";

/**
 * Mission 022 — Section 6/9. One recommendation type per M021 signal
 * type it interprets — see rules/index.ts for the full mapping. A
 * closed union, same rationale as SignalType: exhaustiveness
 * checking, no typo'd type ever reaches the UI.
 */
export const RECOMMENDATION_TYPES = [
  "complete_deal_sale_records",
  "review_overdue_follow_ups",
  "review_sales_decline",
  "review_inventory_imbalance",
  "review_weak_lead_conversion",
  "review_stagnant_pipeline",
  "review_stale_vehicles",
  /**
   * Mission 027 — deliberately its own type, not folded into
   * `review_stale_vehicles` (Section 10 of the mission is explicit:
   * "these are different operational decisions"). Interprets the
   * `stale_vehicle_no_active_lead` signal.
   */
  "review_stale_vehicles_no_active_lead",
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

/**
 * A suggested next step, always a navigation target or a plain
 * instruction — never an action Atlas can execute itself (Section 9:
 * "must remain non-autonomous"). `href: null` covers a recommendation
 * with no single natural destination (e.g. a business-wide trend);
 * the label still tells the operator what to go do.
 */
export type SuggestedAction = {
  label: string;
  href: string | null;
};

export type Recommendation = {
  /** Stable within one OperationalIntelligenceResult — currently equals `type`, mirroring Signal.id, since M022's rules are business-level (at most one recommendation per type per evaluation). */
  id: RecommendationType;
  type: RecommendationType;
  title: string;
  summary: string;
  /** The "why" — explicitly ties back to the evidence, never a causal claim the data doesn't support (Section 7D/7E). */
  rationale: string;
  priority: Priority;
  evidence: SignalEvidence[];
  /** Empty when the source signal can't safely resolve to individual entities — aggregate evidence stands on its own rather than a fabricated list (Section 4). */
  affectedEntities: AffectedEntity[];
  suggestedAction: SuggestedAction;
  sourceSignal: SignalType;
  timeRange: ResolvedDateRange;
  /** Always `{ kind: "deterministic" }` in M022 — reserved for M023 the same way Signal's confidence field is. */
  confidence: SignalConfidence;
  generatedAt: string;
};

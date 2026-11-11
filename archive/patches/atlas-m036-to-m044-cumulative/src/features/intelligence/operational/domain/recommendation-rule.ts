import type { Signal, SignalType } from "../../domain/signal";
import type { AffectedEntity } from "./affected-entity";
import type { OperationalEntityResolver } from "../entity-resolution/entity-resolver";
import type { Recommendation } from "./recommendation";

/**
 * Mission 022 — Section 6/21. Split into a pure part and an optional
 * IO part, unlike M021's fully-pure Rule:
 *
 * - `build` is pure and deterministic — same signal in, same
 *   recommendation shell out. This is where title/summary/rationale/
 *   priority/evidence/suggestedAction are decided, and it's
 *   independently unit-testable with a hand-built Signal fixture, no
 *   database involved.
 * - `resolveEntities` is the only IO in this feature — bounded
 *   repository reads through OperationalEntityResolver. Omitted
 *   entirely for rules whose signal can't safely resolve to
 *   individual entities (Section 4) rather than returning an empty
 *   array from a method that pretends to try.
 */
export type RecommendationRule = {
  type: Recommendation["type"];
  /** Which M021 signal this rule interprets — the engine looks up a matching signal by this type. */
  sourceSignalType: SignalType;
  build(signal: Signal, generatedAt: string): Omit<Recommendation, "affectedEntities">;
  /** `now` is always the same generatedAt timestamp passed to `build` — the engine's single source of "now" for one evaluation, never re-read from the clock inside a rule, so entity resolution (e.g. "overdue as of now") stays consistent with the recommendation it's attached to and with Section 15's determinism requirement. */
  resolveEntities?: (signal: Signal, resolver: OperationalEntityResolver, now: string) => Promise<AffectedEntity[]>;
};

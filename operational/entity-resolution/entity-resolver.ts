import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { AffectedEntity } from "../domain/affected-entity";

/**
 * Mission 022 — Section 4. Every result is bounded to
 * `OPERATIONAL_ENTITY_LIMIT` and deterministically ordered (most
 * overdue first / most recent first) by the implementation, so a
 * signal with hundreds of matching leads never turns into an
 * unbounded UI list or an unbounded query — same "bounded, prioritized
 * intelligence" requirement as everywhere else in M022.
 */
export const OPERATIONAL_ENTITY_LIMIT = 5;

/**
 * Section 4 — resolves an M021 signal to the bounded set of domain
 * records behind it, business-scoped through the repositories it's
 * constructed with. Only signals where this resolution is genuinely
 * safe and useful get a method here (Section 4: "where a signal
 * cannot safely identify individual entities, retain aggregate
 * evidence instead of fabricating entity references") — that's why
 * this interface has three methods, not one per every signal type.
 */
export interface OperationalEntityResolver {
  resolveOverdueFollowUpLeads(now: string): Promise<AffectedEntity[]>;
  resolveDealsAwaitingSale(): Promise<AffectedEntity[]>;
  resolveStagnantPipelineLeads(dateRange: ResolvedDateRange): Promise<AffectedEntity[]>;
  /** Mission 026 — the bounded entity-level counterpart to the `vehicle_slow_movement` signal. */
  resolveStaleVehicles(now: string): Promise<AffectedEntity[]>;
  /** Mission 027 — the bounded entity-level counterpart to the `stale_vehicle_no_active_lead` signal. */
  resolveStaleVehiclesWithoutActiveLead(now: string): Promise<AffectedEntity[]>;
}

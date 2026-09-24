import type { Vehicle, VehicleStatus } from "../data/types";
import type { CreateVehicleInput, UpdateVehicleInput } from "../domain/vehicle-input";
import type { PaginatedResult, VehicleQuery } from "../domain/vehicle-query";

export interface VehicleRepository {
  /** Full unpaginated list — kept for callers that genuinely need everything (e.g. seeding, small aggregate work). Prefer listPaged for inventory display. */
  list(): Promise<Vehicle[]>;
  listPaged(query: VehicleQuery): Promise<PaginatedResult<Vehicle>>;
  getById(id: string): Promise<Vehicle | null>;
  /** Batched lookup for multiple ids in one query — avoids N+1 when resolving lead→vehicle references. */
  getByIds(ids: string[]): Promise<Vehicle[]>;
  findByStockId(stockId: string): Promise<Vehicle | null>;
  create(input: CreateVehicleInput): Promise<Vehicle>;
  /**
   * Mission 029, Section 14 — atomically re-checks the business's
   * current vehicle count against `limit` and inserts in the same
   * database transaction, closing the check-then-insert race that
   * existed when the count (via countByStatus) and the insert were
   * two separate awaited calls in the action layer. `limit === null`
   * means unlimited (skips the check entirely). Callers resolve
   * `limit` themselves via EntitlementService.resolveLimitGate before
   * calling this — this method has no knowledge of plans/entitlements,
   * it only enforces whatever numeric cap it's given (or none).
   */
  createWithinLimit(
    input: CreateVehicleInput,
    limit: number | null
  ): Promise<{ vehicle: Vehicle | null; currentCount: number; limitExceeded: boolean }>;
  /** Returns null when no vehicle exists with the given id. */
  update(id: string, input: UpdateVehicleInput): Promise<Vehicle | null>;
  /** Returns false when no vehicle existed with the given id. */
  delete(id: string): Promise<boolean>;
  /** Count of vehicles per status — a single aggregate query, not a full-table load. */
  countByStatus(): Promise<Record<VehicleStatus, number>>;
  /** Distinct make values, for populating the inventory make filter without loading every vehicle. */
  listDistinctMakes(): Promise<string[]>;
  /**
   * Aggregate value stats over "active" (non-sold) inventory — a
   * single query, not a full-table load. See DashboardSummary's
   * business-rule comment for why sold vehicles are excluded.
   */
  getActiveInventoryValueStats(): Promise<{
    activeCount: number;
    totalValue: number;
    averagePrice: number;
  }>;
  /** Count of vehicles added on or after the given ISO timestamp. */
  countAddedSince(sinceIso: string): Promise<number>;
  /** Vehicle counts grouped by make, highest first, limited to `limit` rows. */
  countByMake(limit: number): Promise<{ make: string; count: number }[]>;
  /**
   * Mission 026 — raw fact for inventory-age intelligence: age in
   * days (as of `now`) of every currently-available vehicle, oldest
   * first. Deliberately not threshold-filtered here — M021's rule
   * applies its own centralized threshold to this array, the same
   * "M020 provides facts, M021 applies thresholds" split every other
   * M021 rule already follows (see e.g. inventoryOversupplyRule
   * reading raw `availableVehicles`/sales-pace facts rather than a
   * pre-filtered count).
   */
  getAvailableVehicleAgeDays(now: string): Promise<number[]>;
  /**
   * Mission 026 — the bounded, entity-level counterpart to
   * `getAvailableVehicleAgeDays`: the actual available vehicles whose
   * age exceeds `minAgeDays`, most-stale-first, database-limited.
   * Mirrors `getOverdueFollowUpLeads`/`getDealsAwaitingSale`'s split
   * between an M021 aggregate fact and an M022 bounded entity list.
   */
  getStaleAvailableVehicles(minAgeDays: number, now: string, limit: number): Promise<Vehicle[]>;
  /**
   * Mission 027 — the cross-entity counterpart to `getAvailableVehicleAgeDays`:
   * age in days (as of `now`) of every currently-available vehicle that
   * has zero *active* leads referencing it (LEAD_ACTIVE_STATUSES —
   * `won`/`lost` don't count, see Section 4/8 of the mission), oldest
   * first. Same "M020 provides facts, M021 applies thresholds" split as
   * its M026 sibling — not pre-filtered by age here, the rule applies
   * its own threshold. A vehicle with an active lead never appears in
   * this array regardless of age.
   */
  getAvailableVehicleAgeDaysWithoutActiveLead(now: string): Promise<number[]>;
  /**
   * Mission 027 — the bounded, entity-level counterpart to
   * `getAvailableVehicleAgeDaysWithoutActiveLead`, mirroring
   * `getStaleAvailableVehicles`'s own split. Reuses M021's centralized
   * `warningAgeDays` threshold, never a second copy of the number.
   */
  getStaleAvailableVehiclesWithoutActiveLead(minAgeDays: number, now: string, limit: number): Promise<Vehicle[]>;
}

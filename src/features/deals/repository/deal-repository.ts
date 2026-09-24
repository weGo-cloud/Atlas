import type { Deal, DealStatus } from "../domain/deal";
import type { UpdateDealInput } from "../domain/deal-input";
import type { DealFilter, DealQuery, PaginatedDealResult } from "../domain/deal-query";

/**
 * Repository-level create shape — every field is already resolved by
 * DealService (customer derived from the lead, vehicleLabel snapshot
 * computed, agreedPrice defaulted). This is deliberately not the same
 * type as the domain-facing CreateDealInput, which leaves those to
 * the service the same way LeadService resolves vehicleLabel before
 * calling LeadRepository.createLead.
 */
export type CreateDealRecord = {
  customerId: string;
  leadId: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  agreedPrice: number;
  depositAmount?: number | null;
  notes?: string;
};

export interface DealRepository {
  createDeal(input: CreateDealRecord): Promise<Deal>;
  getDealById(id: string): Promise<Deal | null>;
  getDeals(filter?: DealFilter): Promise<Deal[]>;
  getDealsPaged(query: DealQuery): Promise<PaginatedDealResult<Deal>>;
  updateDeal(id: string, input: UpdateDealInput): Promise<Deal | null>;
  /**
   * Atomic, concurrency-safe status transition: only succeeds if the
   * row's current status still matches `expectedFrom` at write time
   * (a single conditional UPDATE, not read-then-write) — mirrors the
   * fix applied to LeadRepository.completeFollowUp in Mission 017.
   * Returns null when no row matches (either the deal doesn't exist,
   * or its status has already moved on since the caller last read
   * it — including a concurrent transition winning the race).
   */
  updateDealStatus(id: string, expectedFrom: DealStatus, to: DealStatus): Promise<Deal | null>;
  getDealsForCustomer(customerId: string): Promise<Deal[]>;
  getDealsForLead(leadId: string): Promise<Deal[]>;
  getDealsForVehicle(vehicleId: string): Promise<Deal[]>;
  /** The single active (non-terminal) deal for a lead, if any — the read side of the duplicate-active-deal invariant enforced by the DB's partial unique index. */
  getActiveDealForLead(leadId: string): Promise<Deal | null>;
  /**
   * Mission 022 — the bounded, entity-level counterpart to
   * AnalyticsRepository.getIntegrityMetrics's
   * `completedDealsAwaitingSale` count: same join/filter (completed
   * Deal, no matching Sale row), but returns the actual Deals,
   * most-recently-updated first, so Atlas Intelligence can name
   * which deals need a Sale recorded.
   */
  getDealsAwaitingSale(limit: number): Promise<Deal[]>;
}

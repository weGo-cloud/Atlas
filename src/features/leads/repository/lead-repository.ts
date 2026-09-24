import type { LeadStatus } from "../domain/lead";
import type { Lead } from "../domain/lead";
import type { CreateLeadInput, UpdateLeadInput } from "../domain/lead-input";
import type { LeadFilter, LeadQuery, PaginatedLeadResult } from "../domain/lead-query";

export interface LeadRepository {
  createLead(input: CreateLeadInput): Promise<Lead>;
  getLeadById(id: string): Promise<Lead | null>;
  getLeads(filter?: LeadFilter): Promise<Lead[]>;
  /** Mission 015 — database-limited pagination; query.page/pageSize are always pre-normalized by the service. */
  getLeadsPaged(query: LeadQuery): Promise<PaginatedLeadResult<Lead>>;
  updateLead(id: string, input: UpdateLeadInput): Promise<Lead | null>;
  /** Returns null when no lead exists with the given id. */
  updateLeadStatus(id: string, status: LeadStatus): Promise<Lead | null>;
  /** Mission 017 — clears nextFollowUpAt and stamps lastContactedAt in one write. Returns null when no lead exists with the given id. Does NOT check whether a follow-up was actually scheduled — that's LeadService's job, so this stays a pure state-transition primitive. */
  completeFollowUp(id: string): Promise<Lead | null>;
  getLeadsForCustomer(customerId: string): Promise<Lead[]>;
  getLeadsForVehicle(vehicleId: string): Promise<Lead[]>;
  /** Mission 030 — Furniture-vertical equivalent of getLeadsForVehicle. */
  getLeadsForFurnitureProduct(furnitureProductId: string): Promise<Lead[]>;
  /** Most recently created leads, database-limited — not a full-table load. */
  getRecentLeads(limit: number): Promise<Lead[]>;
  /** Count of leads per status — a single aggregate query, for dashboard use. */
  countByStatus(): Promise<Record<LeadStatus, number>>;
  /**
   * Vehicles ranked by number of leads, highest first — "most
   * interested vehicles" for the dashboard. Returns vehicleId only
   * (never null entries, since a lead with no vehicle can't be
   * ranked); the caller resolves display info via VehicleRepository.
   */
  countLeadsByVehicle(limit: number): Promise<{ vehicleId: string; count: number }[]>;
  /**
   * Mission 022 — the bounded, entity-level counterpart to
   * AnalyticsRepository.getFollowUpMetrics's `overdueFollowUps`
   * count: the same "active status, nextFollowUpAt set and before
   * the start of `now`'s day" definition, but returning the actual
   * leads (most overdue first) instead of just a total, so Atlas
   * Intelligence can name which leads need attention.
   */
  getOverdueFollowUpLeads(now: string, limit: number): Promise<Lead[]>;
  /**
   * Mission 022 — active leads created within a date range, most
   * recent first. Backs the stagnant-pipeline recommendation's
   * entity resolution (an active lead created inside the signal's
   * range is by definition part of "leads that haven't been decided
   * yet"). `from`/`to` follow AnalyticsRepository's own convention —
   * inclusive-from, exclusive-to, either bound `null` for open-ended.
   */
  getActiveLeadsCreatedInRange(from: string | null, to: string | null, limit: number): Promise<Lead[]>;
  /**
   * Mission 023 — training-only. Every lead (any status, active or
   * terminal — a completed/lost lead is exactly as valid a training
   * example as an open one) created at or before `before`, oldest
   * first. Deliberately unbounded/unfiltered by status: dataset
   * construction needs the full matured cohort, not a page of it.
   * Never called from a request handler — see
   * predictive/lead-conversion/dataset-builder.ts.
   */
  getLeadsCreatedBefore(before: string): Promise<Lead[]>;
}

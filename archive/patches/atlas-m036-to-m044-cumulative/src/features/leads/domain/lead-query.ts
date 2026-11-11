import type { LeadStatus } from "./lead";

export type LeadFilter = {
  status?: LeadStatus;
  customerId?: string;
  vehicleId?: string;
  /**
   * Mission 015 — "active" = LEAD_ACTIVE_STATUSES, "terminal" =
   * LEAD_TERMINAL_STATUSES. Mutually exclusive with `status` in
   * practice (the UI only ever sends one), but both are honored if
   * both are present — it's a narrower filter, not a conflict.
   */
  lifecycle?: "active" | "terminal";
  /** Mission 015 — leads with a set, not-yet-passed nextFollowUpAt that are still active. */
  followUpDueBy?: string;
};

export const DEFAULT_LEAD_PAGE_SIZE = 20;
export const MAX_LEAD_PAGE_SIZE = 100;

export type LeadQuery = LeadFilter & {
  /** 1-based. */
  page?: number;
  pageSize?: number;
};

export type PaginatedLeadResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Mirrors normalizePagination in vehicle-query.ts — same clamping rules, kept feature-local rather than shared to avoid coupling two otherwise-independent features to one utility module. */
export function normalizeLeadPagination(query: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number } {
  const page =
    Number.isFinite(query.page) && (query.page ?? 0) >= 1
      ? Math.floor(query.page!)
      : 1;
  const pageSize =
    Number.isFinite(query.pageSize) && (query.pageSize ?? 0) >= 1
      ? Math.min(Math.floor(query.pageSize!), MAX_LEAD_PAGE_SIZE)
      : DEFAULT_LEAD_PAGE_SIZE;
  return { page, pageSize };
}

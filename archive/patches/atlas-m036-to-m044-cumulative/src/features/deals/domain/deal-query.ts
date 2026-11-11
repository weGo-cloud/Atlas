import type { DealStatus } from "./deal";

export type DealFilter = {
  status?: DealStatus;
  customerId?: string;
  leadId?: string;
  vehicleId?: string;
  /** "active" = DEAL_ACTIVE_STATUSES, "terminal" = DEAL_TERMINAL_STATUSES. Mirrors LeadFilter.lifecycle. */
  lifecycle?: "active" | "terminal";
};

export const DEFAULT_DEAL_PAGE_SIZE = 20;
export const MAX_DEAL_PAGE_SIZE = 100;

export type DealQuery = DealFilter & {
  /** 1-based. */
  page?: number;
  pageSize?: number;
};

export type PaginatedDealResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Mirrors normalizeLeadPagination — same clamping rules, kept feature-local for the same reason. */
export function normalizeDealPagination(query: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number } {
  const page =
    Number.isFinite(query.page) && (query.page ?? 0) >= 1 ? Math.floor(query.page!) : 1;
  const pageSize =
    Number.isFinite(query.pageSize) && (query.pageSize ?? 0) >= 1
      ? Math.min(Math.floor(query.pageSize!), MAX_DEAL_PAGE_SIZE)
      : DEFAULT_DEAL_PAGE_SIZE;
  return { page, pageSize };
}

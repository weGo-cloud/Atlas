export type ActivityFilter = {
  customerId?: string;
  leadId?: string;
};

export const DEFAULT_ACTIVITY_PAGE_SIZE = 20;
export const MAX_ACTIVITY_PAGE_SIZE = 100;

export type ActivityQuery = ActivityFilter & {
  /** 1-based. */
  page?: number;
  pageSize?: number;
};

export type PaginatedActivityResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Mirrors normalizeLeadPagination — same clamping rules, kept feature-local for the same reason. */
export function normalizeActivityPagination(query: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number } {
  const page =
    Number.isFinite(query.page) && (query.page ?? 0) >= 1 ? Math.floor(query.page!) : 1;
  const pageSize =
    Number.isFinite(query.pageSize) && (query.pageSize ?? 0) >= 1
      ? Math.min(Math.floor(query.pageSize!), MAX_ACTIVITY_PAGE_SIZE)
      : DEFAULT_ACTIVITY_PAGE_SIZE;
  return { page, pageSize };
}

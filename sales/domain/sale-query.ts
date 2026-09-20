export type SaleFilter = {
  customerId?: string;
  vehicleId?: string;
  dealId?: string;
  /** Inclusive ISO date/datetime bounds on soldAt. */
  soldFrom?: string;
  soldTo?: string;
};

export const DEFAULT_SALE_PAGE_SIZE = 20;
export const MAX_SALE_PAGE_SIZE = 100;

export type SaleQuery = SaleFilter & {
  /** 1-based. */
  page?: number;
  pageSize?: number;
};

export type PaginatedSaleResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Mirrors normalizeDealPagination — same clamping rules, kept feature-local for the same reason. */
export function normalizeSalePagination(query: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number } {
  const page =
    Number.isFinite(query.page) && (query.page ?? 0) >= 1 ? Math.floor(query.page!) : 1;
  const pageSize =
    Number.isFinite(query.pageSize) && (query.pageSize ?? 0) >= 1
      ? Math.min(Math.floor(query.pageSize!), MAX_SALE_PAGE_SIZE)
      : DEFAULT_SALE_PAGE_SIZE;
  return { page, pageSize };
}

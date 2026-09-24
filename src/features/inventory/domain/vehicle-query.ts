import type { VehicleStatus } from "../data/types";

/** Filterable fields — all optional; an unset field means "don't filter on this". */
export type VehicleFilter = {
  status?: VehicleStatus;
  make?: string;
  model?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  /** Matched against stock ID, make, and model. */
  search?: string;
};

/**
 * Explicit allowlist of supported sorts — never pass a raw column
 * name from the client through to the database.
 */
export const VEHICLE_SORT_OPTIONS = [
  "newest",
  "oldest",
  "price-asc",
  "price-desc",
  "year-desc",
] as const;

export type VehicleSortOption = (typeof VEHICLE_SORT_OPTIONS)[number];

export const VEHICLE_SORT_LABEL: Record<VehicleSortOption, string> = {
  newest: "Newest added",
  oldest: "Oldest added",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "year-desc": "Year: newest to oldest",
};

export const DEFAULT_VEHICLE_SORT: VehicleSortOption = "newest";

export function isVehicleSortOption(value: unknown): value is VehicleSortOption {
  return (
    typeof value === "string" &&
    (VEHICLE_SORT_OPTIONS as readonly string[]).includes(value)
  );
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type VehicleQuery = VehicleFilter & {
  sort?: VehicleSortOption;
  /** 1-based. */
  page?: number;
  pageSize?: number;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * Clamps/defaults page and pageSize to safe values — used by the
 * service layer so a repository never receives an out-of-range or
 * client-controlled-without-limit page size.
 */
export function normalizePagination(query: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number } {
  const page =
    Number.isFinite(query.page) && (query.page ?? 0) >= 1
      ? Math.floor(query.page!)
      : 1;
  const pageSize =
    Number.isFinite(query.pageSize) && (query.pageSize ?? 0) >= 1
      ? Math.min(Math.floor(query.pageSize!), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { page, pageSize };
}

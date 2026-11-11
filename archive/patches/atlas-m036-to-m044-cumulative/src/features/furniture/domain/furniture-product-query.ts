import type { FurnitureCategory, FurnitureCondition, FurnitureStatus } from "./furniture-product";

/** Filterable fields — all optional; an unset field means "don't filter on this" (Mission 030, Section 12: category, price, condition, availability at minimum). */
export type FurnitureFilter = {
  status?: FurnitureStatus;
  category?: FurnitureCategory;
  condition?: FurnitureCondition;
  minPrice?: number;
  maxPrice?: number;
  /** Matched against name and description. */
  search?: string;
};

export const FURNITURE_SORT_OPTIONS = ["newest", "oldest", "price-asc", "price-desc"] as const;
export type FurnitureSortOption = (typeof FURNITURE_SORT_OPTIONS)[number];

export const FURNITURE_SORT_LABEL: Record<FurnitureSortOption, string> = {
  newest: "Newest added",
  oldest: "Oldest added",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

export const DEFAULT_FURNITURE_SORT: FurnitureSortOption = "newest";

export function isFurnitureSortOption(value: unknown): value is FurnitureSortOption {
  return typeof value === "string" && (FURNITURE_SORT_OPTIONS as readonly string[]).includes(value);
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type FurnitureQuery = FurnitureFilter & {
  sort?: FurnitureSortOption;
  /** 1-based. */
  page?: number;
  pageSize?: number;
};

export type PaginatedFurnitureResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Mirrors inventory/domain/vehicle-query.ts's normalizePagination exactly. */
export function normalizeFurniturePagination(query: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number } {
  const page =
    Number.isFinite(query.page) && (query.page ?? 0) >= 1 ? Math.floor(query.page!) : 1;
  const pageSize =
    Number.isFinite(query.pageSize) && (query.pageSize ?? 0) >= 1
      ? Math.min(Math.floor(query.pageSize!), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { page, pageSize };
}

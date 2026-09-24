import { isFurnitureCategory, isFurnitureCondition, isFurnitureStatus } from "../domain/furniture-product";
import { DEFAULT_FURNITURE_SORT, DEFAULT_PAGE_SIZE, isFurnitureSortOption, type FurnitureQuery } from "../domain/furniture-product-query";

export type FurnitureSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseNumberParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Mirrors parseInventorySearchParams — unrecognized/malformed values fall back to sensible defaults rather than erroring. */
export function parseFurnitureSearchParams(searchParams: FurnitureSearchParams): FurnitureQuery {
  const status = firstValue(searchParams.status);
  const category = firstValue(searchParams.category);
  const condition = firstValue(searchParams.condition);
  const search = firstValue(searchParams.q);
  const sort = firstValue(searchParams.sort);
  const page = parseNumberParam(firstValue(searchParams.page));
  const pageSize = parseNumberParam(firstValue(searchParams.pageSize));

  return {
    status: isFurnitureStatus(status) ? status : undefined,
    category: isFurnitureCategory(category) ? category : undefined,
    condition: isFurnitureCondition(condition) ? condition : undefined,
    search: search && search.trim() !== "" ? search : undefined,
    minPrice: parseNumberParam(firstValue(searchParams.minPrice)),
    maxPrice: parseNumberParam(firstValue(searchParams.maxPrice)),
    sort: isFurnitureSortOption(sort) ? sort : DEFAULT_FURNITURE_SORT,
    page: page ?? 1,
    pageSize: pageSize ?? DEFAULT_PAGE_SIZE,
  };
}

export function buildFurnitureQueryString(query: FurnitureQuery, overrides: Partial<FurnitureQuery> = {}): string {
  const merged: FurnitureQuery = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (merged.search) params.set("q", merged.search);
  if (merged.status) params.set("status", merged.status);
  if (merged.category) params.set("category", merged.category);
  if (merged.condition) params.set("condition", merged.condition);
  if (merged.minPrice != null) params.set("minPrice", String(merged.minPrice));
  if (merged.maxPrice != null) params.set("maxPrice", String(merged.maxPrice));
  if (merged.sort && merged.sort !== DEFAULT_FURNITURE_SORT) params.set("sort", merged.sort);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export function hasActiveFurnitureFilters(query: FurnitureQuery): boolean {
  return Boolean(
    query.search || query.status || query.category || query.condition || query.minPrice != null || query.maxPrice != null
  );
}

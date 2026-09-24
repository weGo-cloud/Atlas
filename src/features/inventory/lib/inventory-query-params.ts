import type { VehicleStatus } from "../data/types";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_VEHICLE_SORT,
  isVehicleSortOption,
  type VehicleQuery,
} from "../domain/vehicle-query";

const VEHICLE_STATUS_VALUES: VehicleStatus[] = ["available", "reserved", "sold"];

function isVehicleStatus(value: unknown): value is VehicleStatus {
  return (
    typeof value === "string" &&
    (VEHICLE_STATUS_VALUES as string[]).includes(value)
  );
}

function parseNumberParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type InventorySearchParams = Record<
  string,
  string | string[] | undefined
>;

function firstValue(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parses Next.js's raw searchParams object into a typed VehicleQuery.
 * Unrecognized or malformed values fall back to sensible defaults
 * rather than erroring — a hand-edited or stale URL should never
 * crash the page.
 */
export function parseInventorySearchParams(
  searchParams: InventorySearchParams
): VehicleQuery {
  const status = firstValue(searchParams.status);
  const make = firstValue(searchParams.make);
  const model = firstValue(searchParams.model);
  const search = firstValue(searchParams.q);
  const sort = firstValue(searchParams.sort);
  const page = parseNumberParam(firstValue(searchParams.page));
  const pageSize = parseNumberParam(firstValue(searchParams.pageSize));

  return {
    status: isVehicleStatus(status) ? status : undefined,
    make: make && make !== "all" ? make : undefined,
    model: model && model.trim() !== "" ? model : undefined,
    search: search && search.trim() !== "" ? search : undefined,
    minPrice: parseNumberParam(firstValue(searchParams.minPrice)),
    maxPrice: parseNumberParam(firstValue(searchParams.maxPrice)),
    minYear: parseNumberParam(firstValue(searchParams.minYear)),
    maxYear: parseNumberParam(firstValue(searchParams.maxYear)),
    sort: isVehicleSortOption(sort) ? sort : DEFAULT_VEHICLE_SORT,
    page: page ?? 1,
    pageSize: pageSize ?? DEFAULT_PAGE_SIZE,
  };
}

/**
 * Builds a query string from a VehicleQuery plus overrides — used for
 * pagination/sort links and toolbar navigation. Omits default/empty
 * values so URLs stay clean (no `?sort=newest&page=1` clutter).
 */
export function buildInventoryQueryString(
  query: VehicleQuery,
  overrides: Partial<VehicleQuery> = {}
): string {
  const merged: VehicleQuery = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (merged.search) params.set("q", merged.search);
  if (merged.status) params.set("status", merged.status);
  if (merged.make) params.set("make", merged.make);
  if (merged.model) params.set("model", merged.model);
  if (merged.minPrice != null) params.set("minPrice", String(merged.minPrice));
  if (merged.maxPrice != null) params.set("maxPrice", String(merged.maxPrice));
  if (merged.minYear != null) params.set("minYear", String(merged.minYear));
  if (merged.maxYear != null) params.set("maxYear", String(merged.maxYear));
  if (merged.sort && merged.sort !== DEFAULT_VEHICLE_SORT) {
    params.set("sort", merged.sort);
  }
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export function hasActiveInventoryFilters(query: VehicleQuery): boolean {
  return Boolean(
    query.search ||
      query.status ||
      query.make ||
      query.model ||
      query.minPrice != null ||
      query.maxPrice != null ||
      query.minYear != null ||
      query.maxYear != null
  );
}

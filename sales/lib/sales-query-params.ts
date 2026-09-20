import type { SaleQuery } from "../domain/sale-query";

export type SaleSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseNumberParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Mirrors parseDealSearchParams — malformed/unrecognized values fall back to defaults rather than erroring. */
export function parseSaleSearchParams(searchParams: SaleSearchParams): SaleQuery {
  return {
    page: parseNumberParam(firstValue(searchParams.page)),
    pageSize: parseNumberParam(firstValue(searchParams.pageSize)),
  };
}

/** Builds a /app/sales query string from the current query, with overrides for e.g. changing the page. */
export function buildSalesQueryString(query: SaleQuery, overrides: Partial<{ page: number }> = {}): string {
  const params = new URLSearchParams();
  const page = overrides.page ?? query.page;
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

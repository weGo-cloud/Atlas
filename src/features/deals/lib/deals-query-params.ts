import { isDealStatus, type DealStatus } from "../domain/deal";
import type { DealQuery } from "../domain/deal-query";

export type DealSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseNumberParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Mirrors parseLeadSearchParams — malformed/unrecognized values fall back to defaults rather than erroring. */
export function parseDealSearchParams(searchParams: DealSearchParams): DealQuery {
  const statusParam = firstValue(searchParams.status);
  const status: DealStatus | undefined = isDealStatus(statusParam) ? statusParam : undefined;

  return {
    status,
    page: parseNumberParam(firstValue(searchParams.page)),
    pageSize: parseNumberParam(firstValue(searchParams.pageSize)),
  };
}

/** Builds a /app/deals query string from the current query, with overrides for e.g. changing the page. */
export function buildDealsQueryString(
  query: DealQuery,
  overrides: Partial<{ page: number; status: string }> = {}
): string {
  const params = new URLSearchParams();

  const status = overrides.status ?? query.status;
  if (status) params.set("status", status);

  const page = overrides.page ?? query.page;
  if (page && page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

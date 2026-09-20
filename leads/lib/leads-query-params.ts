import { isLeadStatus, type LeadStatus } from "../domain/lead";
import type { LeadQuery } from "../domain/lead-query";

export type LeadSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseNumberParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Parses Next.js's raw searchParams into a typed LeadQuery. Malformed/unrecognized values fall back to defaults rather than erroring. */
export function parseLeadSearchParams(searchParams: LeadSearchParams): LeadQuery {
  const statusParam = firstValue(searchParams.status);
  const status: LeadStatus | undefined = isLeadStatus(statusParam) ? statusParam : undefined;

  const followUpParam = firstValue(searchParams.followUp);
  const followUpDueBy =
    followUpParam === "due" ? new Date().toISOString().slice(0, 10) : undefined;

  return {
    status,
    followUpDueBy,
    page: parseNumberParam(firstValue(searchParams.page)),
    pageSize: parseNumberParam(firstValue(searchParams.pageSize)),
  };
}

/** Builds a /app/leads query string from the current query, with overrides for e.g. changing the page. */
export function buildLeadsQueryString(
  query: LeadQuery & { followUpDueBy?: string },
  overrides: Partial<{ page: number; status: string; followUp: string }> = {}
): string {
  const params = new URLSearchParams();

  const status = overrides.status ?? query.status;
  if (status) params.set("status", status);

  const followUp = overrides.followUp ?? (query.followUpDueBy ? "due" : undefined);
  if (followUp) params.set("followUp", followUp);

  const page = overrides.page ?? query.page;
  if (page && page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

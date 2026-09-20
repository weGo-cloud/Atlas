import { isDateRangePreset, type DateRangePreset } from "../domain/date-range";

export type AnalyticsSearchParams = Record<string, string | string[] | undefined>;

export type AnalyticsQuery = {
  preset: DateRangePreset;
  customFrom?: string;
  customTo?: string;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Mirrors parseSaleSearchParams — malformed/unrecognized values fall back to a safe default (last30) rather than erroring. */
export function parseAnalyticsSearchParams(searchParams: AnalyticsSearchParams): AnalyticsQuery {
  const rawPreset = firstValue(searchParams.range);
  const preset = isDateRangePreset(rawPreset) ? rawPreset : "last30";
  const customFrom = firstValue(searchParams.from);
  const customTo = firstValue(searchParams.to);

  return {
    preset,
    customFrom: preset === "custom" ? customFrom : undefined,
    customTo: preset === "custom" ? customTo : undefined,
  };
}

/** Builds a /app/analytics query string for a given preset, preserving custom bounds only when the preset is itself "custom". */
export function buildAnalyticsQueryString(query: AnalyticsQuery): string {
  const params = new URLSearchParams();
  if (query.preset !== "last30") params.set("range", query.preset);
  if (query.preset === "custom") {
    if (query.customFrom) params.set("from", query.customFrom);
    if (query.customTo) params.set("to", query.customTo);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

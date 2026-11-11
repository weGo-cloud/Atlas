/**
 * Formats a 0–1 rate as a whole-percentage string, or "N/A" for the
 * mathematically-undefined case (Section 4 — zero denominator).
 * Deliberately takes `number | null`, not just `number`, so callers
 * can pass a FunnelMetrics rate straight through without an
 * intermediate null check at every call site.
 */
export function formatRate(rate: number | null): string {
  if (rate === null) return "N/A";
  return `${Math.round(rate * 100)}%`;
}

const countFormatter = new Intl.NumberFormat("en-KE");

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

/**
 * Mission 020 — the one reusable date-range abstraction for Analytics.
 *
 * `from` is inclusive, `to` is exclusive — a single consistent
 * convention applied everywhere a range is compared against a stored
 * ISO timestamp (`gte(column, from)` / `lt(column, to)`), so no
 * individual query has to reason about boundary inclusivity itself.
 *
 * `allTime` resolves to `{ from: null, to: null }` — "no filter" is
 * represented explicitly rather than as a sentinel date far in the
 * past/future, so every repository method can treat "range is unset"
 * as its own branch instead of guessing from a magic value.
 *
 * Not every domain shares one timestamp meaning (Section 6 of the
 * mission): Leads/Deals use `createdAt`, Sales uses `soldAt`,
 * Activities uses `createdAt`, and Inventory has no time dimension at
 * all (it's always a current snapshot). This module only resolves the
 * *range itself* — which column each query filters on on is each
 * repository method's job, not this one's.
 */
export const DATE_RANGE_PRESETS = [
  "today",
  "last7",
  "last30",
  "last90",
  "thisMonth",
  "previousMonth",
  "allTime",
  "custom",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABEL: Record<DateRangePreset, string> = {
  today: "Today",
  last7: "Last 7 days",
  last30: "Last 30 days",
  last90: "Last 90 days",
  thisMonth: "This month",
  previousMonth: "Previous month",
  allTime: "All time",
  custom: "Custom range",
};

export type ResolvedDateRange = {
  preset: DateRangePreset;
  /** Inclusive ISO datetime, or null for "no lower bound" (allTime, or an open custom range). */
  from: string | null;
  /** Exclusive ISO datetime, or null for "no upper bound". */
  to: string | null;
};

export function isDateRangePreset(value: unknown): value is DateRangePreset {
  return typeof value === "string" && (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Resolves a preset (plus optional custom bounds) into concrete
 * from/to ISO timestamps, relative to `now`. `now` is a parameter
 * rather than always `new Date()` so date-range tests are
 * deterministic (Section 12 — "boundary conditions") instead of
 * depending on wall-clock time.
 */
export function resolveDateRange(
  preset: DateRangePreset,
  options: { customFrom?: string | null; customTo?: string | null; now?: Date } = {}
): ResolvedDateRange {
  const now = options.now ?? new Date();

  switch (preset) {
    case "today": {
      const from = startOfDay(now);
      const to = addDays(from, 1);
      return { preset, from: from.toISOString(), to: to.toISOString() };
    }
    case "last7": {
      const to = addDays(startOfDay(now), 1);
      const from = addDays(to, -7);
      return { preset, from: from.toISOString(), to: to.toISOString() };
    }
    case "last30": {
      const to = addDays(startOfDay(now), 1);
      const from = addDays(to, -30);
      return { preset, from: from.toISOString(), to: to.toISOString() };
    }
    case "last90": {
      const to = addDays(startOfDay(now), 1);
      const from = addDays(to, -90);
      return { preset, from: from.toISOString(), to: to.toISOString() };
    }
    case "thisMonth": {
      const from = startOfMonth(now);
      const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      return { preset, from: from.toISOString(), to: to.toISOString() };
    }
    case "previousMonth": {
      const startOfThisMonth = startOfMonth(now);
      const from = new Date(startOfThisMonth.getFullYear(), startOfThisMonth.getMonth() - 1, 1);
      return { preset, from: from.toISOString(), to: startOfThisMonth.toISOString() };
    }
    case "allTime":
      return { preset, from: null, to: null };
    case "custom":
      return {
        preset,
        from: options.customFrom ? new Date(options.customFrom).toISOString() : null,
        to: options.customTo ? new Date(options.customTo).toISOString() : null,
      };
  }
}

/** Whole-day span of a resolved range, or null when either bound is open (allTime / an unbounded custom range) — used to pick trend-bucket granularity. */
export function rangeSpanDays(range: ResolvedDateRange): number | null {
  if (!range.from || !range.to) return null;
  const ms = new Date(range.to).getTime() - new Date(range.from).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

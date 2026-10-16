const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // Africa/Nairobi is UTC+3 all year (no daylight saving).

/**
 * Start (UTC instant) of the calendar month that contains `now`, in
 * Africa/Nairobi — the boundary the monthly message allowance resets on.
 * Pure: `now` is always passed in.
 */
export function monthStartNairobi(now: Date): Date {
  const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - NAIROBI_OFFSET_MS);
}

/** Start of the *next* Nairobi calendar month — when the allowance resets. */
export function nextMonthStartNairobi(now: Date): Date {
  const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - NAIROBI_OFFSET_MS);
}

export function addMinutes(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

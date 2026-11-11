import { describe, expect, it } from "vitest";

import { rangeSpanDays, resolveDateRange } from "../date-range";

// Fixed reference instant so every test is deterministic regardless
// of wall-clock time — Section 12's "boundary conditions" requirement.
const NOW = new Date("2026-03-17T14:32:00.000Z"); // a Tuesday

describe("resolveDateRange", () => {
  it("today resolves to the current day's inclusive start / exclusive next-day start", () => {
    const range = resolveDateRange("today", { now: NOW });
    expect(range.from).toBe(new Date(2026, 2, 17).toISOString());
    expect(range.to).toBe(new Date(2026, 2, 18).toISOString());
  });

  it("last7 spans exactly 7 whole days ending today (exclusive tomorrow)", () => {
    const range = resolveDateRange("last7", { now: NOW });
    expect(range.from).toBe(new Date(2026, 2, 11).toISOString());
    expect(range.to).toBe(new Date(2026, 2, 18).toISOString());
    expect(rangeSpanDays(range)).toBe(7);
  });

  it("last30 spans exactly 30 days", () => {
    const range = resolveDateRange("last30", { now: NOW });
    expect(rangeSpanDays(range)).toBe(30);
  });

  it("last90 spans exactly 90 days", () => {
    const range = resolveDateRange("last90", { now: NOW });
    expect(rangeSpanDays(range)).toBe(90);
  });

  it("thisMonth starts on the 1st of the current month and ends on the 1st of next month", () => {
    const range = resolveDateRange("thisMonth", { now: NOW });
    expect(range.from).toBe(new Date(2026, 2, 1).toISOString());
    expect(range.to).toBe(new Date(2026, 3, 1).toISOString());
  });

  it("previousMonth is the whole calendar month before the current one", () => {
    const range = resolveDateRange("previousMonth", { now: NOW });
    expect(range.from).toBe(new Date(2026, 1, 1).toISOString());
    expect(range.to).toBe(new Date(2026, 2, 1).toISOString());
  });

  it("previousMonth correctly rolls back across a year boundary (January -> December)", () => {
    const januaryNow = new Date("2026-01-15T00:00:00.000Z");
    const range = resolveDateRange("previousMonth", { now: januaryNow });
    expect(range.from).toBe(new Date(2025, 11, 1).toISOString());
    expect(range.to).toBe(new Date(2026, 0, 1).toISOString());
  });

  it("allTime has no lower or upper bound", () => {
    const range = resolveDateRange("allTime", { now: NOW });
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
    expect(rangeSpanDays(range)).toBeNull();
  });

  it("custom uses the supplied bounds verbatim (resolved to ISO)", () => {
    const range = resolveDateRange("custom", {
      customFrom: "2026-01-01",
      customTo: "2026-01-15",
      now: NOW,
    });
    expect(range.from).toBe(new Date("2026-01-01").toISOString());
    expect(range.to).toBe(new Date("2026-01-15").toISOString());
  });

  it("custom with only a from bound leaves the upper bound open", () => {
    const range = resolveDateRange("custom", { customFrom: "2026-01-01", now: NOW });
    expect(range.from).toBe(new Date("2026-01-01").toISOString());
    expect(range.to).toBeNull();
  });

  it("custom with neither bound behaves like an unfiltered range", () => {
    const range = resolveDateRange("custom", { now: NOW });
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
  });
});

describe("rangeSpanDays", () => {
  it("returns null when either bound is open", () => {
    expect(rangeSpanDays({ preset: "allTime", from: null, to: null })).toBeNull();
    expect(rangeSpanDays({ preset: "custom", from: "2026-01-01T00:00:00.000Z", to: null })).toBeNull();
  });

  it("rounds a same-day span up to at least 1", () => {
    const span = rangeSpanDays({
      preset: "custom",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-01T23:59:59.000Z",
    });
    expect(span).toBe(1);
  });
});

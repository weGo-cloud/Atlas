import { describe, expect, it } from "vitest";

import { GRACE_DAYS, addMonthsUtc, isPastGrace, isPromptDue, promptSchedule } from "../domain/billing";

describe("addMonthsUtc", () => {
  it("clamps to the end of shorter months and crosses years", () => {
    expect(addMonthsUtc("2026-01-31T10:00:00.000Z", 1)).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonthsUtc("2028-01-31T10:00:00.000Z", 1)).toBe("2028-02-29T10:00:00.000Z");
    expect(addMonthsUtc("2026-12-15T00:00:00.000Z", 1)).toBe("2027-01-15T00:00:00.000Z");
    expect(addMonthsUtc("2026-03-31T00:00:00.000Z", 1)).toBe("2026-04-30T00:00:00.000Z");
  });
});

describe("prompt schedule", () => {
  const due = "2026-06-10T00:00:00.000Z";
  const inv = (attempts: number, lastAttemptAt: string | null = null, status = "open") => ({ attempts, lastAttemptAt, dueAt: due, status }) as never;
  it("is 3 days before, on the day, +2 and +5", () => {
    expect(promptSchedule(due).map((ms) => new Date(ms).toISOString().slice(0, 10))).toEqual(["2026-06-07", "2026-06-10", "2026-06-12", "2026-06-15"]);
  });
  it("sends only when scheduled, within attempts, outside the cooldown, and only while open", () => {
    expect(isPromptDue(inv(0), new Date("2026-06-06T23:59:00Z"))).toBe(false);
    expect(isPromptDue(inv(0), new Date("2026-06-07T00:01:00Z"))).toBe(true);
    expect(isPromptDue(inv(1), new Date("2026-06-09T00:00:00Z"))).toBe(false);
    expect(isPromptDue(inv(1), new Date("2026-06-10T00:00:00Z"))).toBe(true);
    expect(isPromptDue(inv(1, "2026-06-10T00:00:00Z"), new Date("2026-06-10T00:05:00Z"))).toBe(false); // cooldown
    expect(isPromptDue(inv(4), new Date("2026-07-01T00:00:00Z"))).toBe(false); // out of attempts
    expect(isPromptDue(inv(0, null, "paid"), new Date("2026-06-20T00:00:00Z"))).toBe(false);
  });
  it("grace is 7 days after the due date", () => {
    expect(GRACE_DAYS).toBe(7);
    expect(isPastGrace({ dueAt: due }, new Date("2026-06-17T00:00:00Z"))).toBe(false);
    expect(isPastGrace({ dueAt: due }, new Date("2026-06-17T00:00:01Z"))).toBe(true);
  });
});

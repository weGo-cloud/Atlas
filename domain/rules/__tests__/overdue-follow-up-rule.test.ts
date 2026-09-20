import { describe, expect, it } from "vitest";

import { contextFrom } from "../../__tests__/fixtures";
import { overdueFollowUpRule } from "../overdue-follow-up-rule";

const NOW = "2026-09-02T12:00:00.000Z";

function overdueContext(overdueFollowUps: number) {
  return contextFrom({
    followUps: { overdueFollowUps, dueFollowUps: 0, upcomingFollowUps: 0, activeLeadsWithoutFollowUp: 0 },
  });
}

describe("overdueFollowUpRule", () => {
  it("does not trigger below the warning threshold (2)", () => {
    expect(overdueFollowUpRule.evaluate(overdueContext(2), NOW)).toBeNull();
  });

  it("triggers WARNING exactly at the warning threshold (3)", () => {
    expect(overdueFollowUpRule.evaluate(overdueContext(3), NOW)?.severity).toBe("WARNING");
  });

  it("stays WARNING just below the critical threshold (7)", () => {
    expect(overdueFollowUpRule.evaluate(overdueContext(7), NOW)?.severity).toBe("WARNING");
  });

  it("escalates to CRITICAL exactly at the critical threshold (8)", () => {
    expect(overdueFollowUpRule.evaluate(overdueContext(8), NOW)?.severity).toBe("CRITICAL");
  });

  it("is deterministic", () => {
    const context = overdueContext(10);
    expect(overdueFollowUpRule.evaluate(context, NOW)).toEqual(overdueFollowUpRule.evaluate(context, NOW));
  });
});

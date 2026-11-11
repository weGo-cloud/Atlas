import { describe, expect, it } from "vitest";

import { buildDecisionContext } from "../context";
import { recommendation, LAST_30_RANGE } from "./fixtures";
import { composeOperationalResult } from "../../../operational/domain/operational-result";

describe("buildDecisionContext", () => {
  it("carries the OperationalIntelligenceResult's timeRange and recommendations through unchanged", () => {
    const rec = recommendation("review_overdue_follow_ups", "HIGH");
    const operationalResult = composeOperationalResult(LAST_30_RANGE, [], [rec], "2026-09-02T12:00:00.000Z");
    const context = buildDecisionContext(operationalResult);
    expect(context.dateRange).toEqual(LAST_30_RANGE);
    expect(context.recommendations).toEqual([rec]);
  });

  it("produces an empty recommendations array from an empty result", () => {
    const operationalResult = composeOperationalResult(LAST_30_RANGE, [], [], "2026-09-02T12:00:00.000Z");
    expect(buildDecisionContext(operationalResult).recommendations).toEqual([]);
  });
});

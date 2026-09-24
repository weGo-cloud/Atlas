import { describe, expect, it } from "vitest";

import { signal } from "./fixtures";
import { buildOperationalContext } from "../operational-context";
import { composeIntelligenceResult } from "../../../domain/insight";
import { contextFrom, LAST_30_RANGE } from "../../../domain/__tests__/fixtures";

describe("buildOperationalContext", () => {
  it("carries the IntelligenceResult's timeRange and signals through unchanged", () => {
    const s = signal("overdue_follow_up_pressure", "WARNING");
    const intelligenceResult = composeIntelligenceResult(contextFrom({ dateRange: LAST_30_RANGE }), [s], "2026-09-02T12:00:00.000Z");
    const context = buildOperationalContext(intelligenceResult);
    expect(context.dateRange).toEqual(LAST_30_RANGE);
    expect(context.signals).toEqual([s]);
  });

  it("produces an empty signals array from an empty IntelligenceResult", () => {
    const intelligenceResult = composeIntelligenceResult(contextFrom({ dateRange: LAST_30_RANGE }), [], "2026-09-02T12:00:00.000Z");
    expect(buildOperationalContext(intelligenceResult).signals).toEqual([]);
  });
});

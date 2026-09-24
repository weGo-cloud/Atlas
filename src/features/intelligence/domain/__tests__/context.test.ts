import { describe, expect, it } from "vitest";

import { buildIntelligenceContext } from "../context";
import { baseOverview, LAST_30_RANGE } from "./fixtures";

describe("buildIntelligenceContext", () => {
  it("preserves the dateRange from the source overview", () => {
    const overview = baseOverview({ dateRange: LAST_30_RANGE });
    const context = buildIntelligenceContext(overview);
    expect(context.dateRange).toEqual(LAST_30_RANGE);
  });

  it("carries the full AnalyticsOverview through as metrics, unmodified", () => {
    const overview = baseOverview();
    const context = buildIntelligenceContext(overview);
    expect(context.metrics).toEqual(overview);
  });
});

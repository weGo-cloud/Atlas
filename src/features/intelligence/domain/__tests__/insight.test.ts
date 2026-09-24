import { describe, expect, it } from "vitest";

import { composeIntelligenceResult } from "../insight";
import { contextFrom } from "./fixtures";
import type { Signal } from "../signal";

const NOW = "2026-09-02T12:00:00.000Z";

function signal(severity: Signal["severity"], type: Signal["type"] = "overdue_follow_up_pressure"): Signal {
  return {
    id: type,
    type,
    severity,
    title: "t",
    summary: "s",
    evidence: [],
    sourceMetric: "test",
    timeRange: { preset: "allTime", from: null, to: null },
    confidence: { kind: "deterministic" },
    triggeredAt: NOW,
  };
}

describe("composeIntelligenceResult", () => {
  it("produces an empty summary with null highestSeverity when there are no signals", () => {
    const context = contextFrom();
    const result = composeIntelligenceResult(context, [], NOW);
    expect(result.summary.totalSignals).toBe(0);
    expect(result.summary.highestSeverity).toBeNull();
    expect(result.summary.bySeverity).toEqual({ INFO: 0, WARNING: 0, CRITICAL: 0 });
  });

  it("counts signals by severity", () => {
    const context = contextFrom();
    const result = composeIntelligenceResult(
      context,
      [signal("WARNING"), signal("CRITICAL"), signal("WARNING", "stagnant_pipeline")],
      NOW
    );
    expect(result.summary.bySeverity).toEqual({ INFO: 0, WARNING: 2, CRITICAL: 1 });
    expect(result.summary.totalSignals).toBe(3);
  });

  it("reports the highest severity present, regardless of input order", () => {
    const context = contextFrom();
    const result = composeIntelligenceResult(context, [signal("INFO"), signal("CRITICAL", "stagnant_pipeline")], NOW);
    expect(result.summary.highestSeverity).toBe("CRITICAL");
  });

  it("carries the context's dateRange and the given generatedAt", () => {
    const context = contextFrom();
    const result = composeIntelligenceResult(context, [], NOW);
    expect(result.timeRange).toEqual(context.dateRange);
    expect(result.generatedAt).toBe(NOW);
  });
});

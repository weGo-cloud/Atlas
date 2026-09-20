import { describe, expect, it } from "vitest";

import { evaluateSignals } from "../engine";
import { contextFrom } from "./fixtures";
import type { Rule } from "../engine";

const NOW = "2026-09-02T12:00:00.000Z";

const alwaysFires: Rule = {
  evaluate: (_context, triggeredAt) => ({
    id: "completed_deals_awaiting_sale",
    type: "completed_deals_awaiting_sale",
    severity: "INFO",
    title: "fires",
    summary: "fires",
    evidence: [],
    sourceMetric: "test",
    timeRange: { preset: "allTime", from: null, to: null },
    confidence: { kind: "deterministic" },
    triggeredAt,
  }),
};

const neverFires: Rule = { evaluate: () => null };

describe("evaluateSignals", () => {
  it("collects only the signals that actually fired", () => {
    const context = contextFrom();
    const signals = evaluateSignals([alwaysFires, neverFires, alwaysFires], context, NOW);
    expect(signals).toHaveLength(2);
  });

  it("returns an empty array when no rule fires", () => {
    const context = contextFrom();
    expect(evaluateSignals([neverFires, neverFires], context, NOW)).toEqual([]);
  });

  it("stamps every signal with the given triggeredAt", () => {
    const context = contextFrom();
    const signals = evaluateSignals([alwaysFires], context, NOW);
    expect(signals[0].triggeredAt).toBe(NOW);
  });

  it("is deterministic across repeated runs against the same context", () => {
    const context = contextFrom();
    const a = evaluateSignals([alwaysFires, neverFires], context, NOW);
    const b = evaluateSignals([alwaysFires, neverFires], context, NOW);
    expect(a).toEqual(b);
  });
});

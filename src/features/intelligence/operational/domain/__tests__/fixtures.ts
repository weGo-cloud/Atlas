import type { ResolvedDateRange } from "../../../../analytics/domain/date-range";
import type { Signal, SignalSeverity, SignalType } from "../../../domain/signal";

export const LAST_30_RANGE: ResolvedDateRange = {
  preset: "last30",
  from: "2026-08-03T00:00:00.000Z",
  to: "2026-09-02T00:00:00.000Z",
};

export function signal(type: SignalType, severity: SignalSeverity, overrides: Partial<Signal> = {}): Signal {
  return {
    id: type,
    type,
    severity,
    title: `${type} title`,
    summary: `${type} summary`,
    evidence: [{ metric: "test.metric", label: "Test metric", observedValue: 1 }],
    sourceMetric: "test",
    timeRange: LAST_30_RANGE,
    confidence: { kind: "deterministic" },
    triggeredAt: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
}

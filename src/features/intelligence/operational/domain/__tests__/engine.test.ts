import { describe, expect, it, vi } from "vitest";

import { signal } from "./fixtures";
import { evaluateRecommendations } from "../engine";
import type { OperationalContext } from "../operational-context";
import type { OperationalEntityResolver } from "../../entity-resolution/entity-resolver";
import type { RecommendationRule } from "../recommendation-rule";

const NOW = "2026-09-02T12:00:00.000Z";

function fakeResolver(): OperationalEntityResolver {
  return {
    resolveOverdueFollowUpLeads: vi.fn().mockResolvedValue([]),
    resolveDealsAwaitingSale: vi.fn().mockResolvedValue([]),
    resolveStagnantPipelineLeads: vi.fn().mockResolvedValue([]),
    resolveStaleVehicles: vi.fn().mockResolvedValue([]),
    resolveStaleVehiclesWithoutActiveLead: vi.fn().mockResolvedValue([]),
  };
}

function ruleFor(type: string, sourceSignalType: string, resolveEntities?: RecommendationRule["resolveEntities"]): RecommendationRule {
  return {
    type: type as RecommendationRule["type"],
    sourceSignalType: sourceSignalType as RecommendationRule["sourceSignalType"],
    build: (s, generatedAt) => ({
      id: type as RecommendationRule["type"],
      type: type as RecommendationRule["type"],
      title: "t",
      summary: "s",
      rationale: "r",
      priority: "MEDIUM",
      evidence: s.evidence,
      suggestedAction: { label: "Review", href: null },
      sourceSignal: s.type,
      timeRange: s.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    }),
    resolveEntities,
  };
}

describe("evaluateRecommendations", () => {
  it("produces no recommendation when its source signal is absent (no signal → no recommendation)", async () => {
    const context: OperationalContext = { dateRange: signal("overdue_follow_up_pressure", "WARNING").timeRange, signals: [] };
    const rules = [ruleFor("review_overdue_follow_ups", "overdue_follow_up_pressure")];
    const result = await evaluateRecommendations(rules, context, fakeResolver(), NOW);
    expect(result).toEqual([]);
  });

  it("produces exactly one recommendation per matching signal", async () => {
    const s = signal("overdue_follow_up_pressure", "WARNING");
    const context: OperationalContext = { dateRange: s.timeRange, signals: [s] };
    const rules = [ruleFor("review_overdue_follow_ups", "overdue_follow_up_pressure")];
    const result = await evaluateRecommendations(rules, context, fakeResolver(), NOW);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("review_overdue_follow_ups");
  });

  it("preserves rules' declaration order regardless of resolution latency", async () => {
    const s1 = signal("overdue_follow_up_pressure", "WARNING");
    const s2 = signal("completed_deals_awaiting_sale", "WARNING");
    const context: OperationalContext = { dateRange: s1.timeRange, signals: [s1, s2] };

    // Rule A resolves slowly, rule B resolves instantly — output order must still be [A, B].
    const slowResolve: RecommendationRule["resolveEntities"] = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return [];
    };
    const fastResolve: RecommendationRule["resolveEntities"] = async () => [];

    const rules = [
      ruleFor("review_overdue_follow_ups", "overdue_follow_up_pressure", slowResolve),
      ruleFor("complete_deal_sale_records", "completed_deals_awaiting_sale", fastResolve),
    ];
    const result = await evaluateRecommendations(rules, context, fakeResolver(), NOW);
    expect(result.map((r) => r.type)).toEqual(["review_overdue_follow_ups", "complete_deal_sale_records"]);
  });

  it("uses an empty affectedEntities array when the rule has no resolveEntities", async () => {
    const s = signal("weak_lead_conversion", "WARNING");
    const context: OperationalContext = { dateRange: s.timeRange, signals: [s] };
    const rules = [ruleFor("review_weak_lead_conversion", "weak_lead_conversion")];
    const result = await evaluateRecommendations(rules, context, fakeResolver(), NOW);
    expect(result[0].affectedEntities).toEqual([]);
  });

  it("is deterministic across repeated runs against the same context", async () => {
    const s = signal("overdue_follow_up_pressure", "WARNING");
    const context: OperationalContext = { dateRange: s.timeRange, signals: [s] };
    const rules = [ruleFor("review_overdue_follow_ups", "overdue_follow_up_pressure")];
    const a = await evaluateRecommendations(rules, context, fakeResolver(), NOW);
    const b = await evaluateRecommendations(rules, context, fakeResolver(), NOW);
    expect(a).toEqual(b);
  });
});

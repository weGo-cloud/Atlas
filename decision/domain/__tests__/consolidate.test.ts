import { describe, expect, it } from "vitest";

import { consolidateDecisions } from "../consolidate";
import { leadEntity } from "./fixtures";
import type { Decision } from "../decision";

const NOW = "2026-09-02T12:00:00.000Z";

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "d1",
    title: "t",
    summary: "s",
    category: "FOLLOW_UP",
    priority: "MEDIUM",
    score: 200,
    rationale: "r",
    evidence: [{ metric: "m1", label: "M1", observedValue: 1 }],
    predictive: { available: [], unavailableCount: 0 },
    sourceRecommendations: ["review_overdue_follow_ups"],
    affectedEntities: [leadEntity("lead_1")],
    suggestedAction: { label: "Review", href: null },
    generatedAt: NOW,
    confidence: { kind: "deterministic" },
    ...overrides,
  };
}

describe("consolidateDecisions", () => {
  it("leaves decisions in different categories unmerged, even if they share an entity", () => {
    const a = decision({ id: "a", category: "FOLLOW_UP", affectedEntities: [leadEntity("lead_1")] });
    const b = decision({ id: "b", category: "LEAD_PRIORITIZATION", affectedEntities: [leadEntity("lead_1")] });
    const result = consolidateDecisions([a, b]);
    expect(result).toHaveLength(2);
  });

  it("leaves decisions in the same category unmerged when they share no entity", () => {
    const a = decision({ id: "a", category: "FOLLOW_UP", affectedEntities: [leadEntity("lead_1")] });
    const b = decision({ id: "b", category: "FOLLOW_UP", affectedEntities: [leadEntity("lead_2")] });
    const result = consolidateDecisions([a, b]);
    expect(result).toHaveLength(2);
  });

  it("merges two decisions that share both category and an affected entity", () => {
    const a = decision({ id: "a", category: "FOLLOW_UP", affectedEntities: [leadEntity("lead_1"), leadEntity("lead_2")] });
    const b = decision({ id: "b", category: "FOLLOW_UP", affectedEntities: [leadEntity("lead_2"), leadEntity("lead_3")] });
    const result = consolidateDecisions([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].affectedEntities.map((e) => e.id).sort()).toEqual(["lead_1", "lead_2", "lead_3"]);
  });

  it("takes the higher priority when merging, and recomputes the score to match", () => {
    const low = decision({ id: "a", priority: "LOW", score: 100, affectedEntities: [leadEntity("lead_1")] });
    const high = decision({ id: "b", priority: "URGENT", score: 400, affectedEntities: [leadEntity("lead_1")] });
    const [merged] = consolidateDecisions([low, high]);
    expect(merged.priority).toBe("URGENT");
    expect(merged.score).toBeGreaterThanOrEqual(400);
  });

  it("deduplicates evidence by metric and affected entities by id", () => {
    const a = decision({
      id: "a",
      evidence: [{ metric: "shared", label: "Shared", observedValue: 1 }],
      affectedEntities: [leadEntity("lead_1")],
    });
    const b = decision({
      id: "b",
      evidence: [
        { metric: "shared", label: "Shared", observedValue: 1 },
        { metric: "unique", label: "Unique", observedValue: 2 },
      ],
      affectedEntities: [leadEntity("lead_1")],
    });
    const [merged] = consolidateDecisions([a, b]);
    expect(merged.evidence.map((e) => e.metric).sort()).toEqual(["shared", "unique"]);
    expect(merged.affectedEntities).toHaveLength(1);
  });

  it("unions sourceRecommendations from every merged decision", () => {
    const a = decision({ id: "a", sourceRecommendations: ["review_overdue_follow_ups"], affectedEntities: [leadEntity("lead_1")] });
    const b = decision({ id: "b", sourceRecommendations: ["review_stagnant_pipeline"], affectedEntities: [leadEntity("lead_1")] });
    const [merged] = consolidateDecisions([a, b]);
    expect(merged.sourceRecommendations.sort()).toEqual(["review_overdue_follow_ups", "review_stagnant_pipeline"]);
  });

  it("notes consolidation in the rationale only when an actual merge happened", () => {
    const solo = decision({ id: "a" });
    const [unmerged] = consolidateDecisions([solo]);
    expect(unmerged.rationale).toBe("r");

    const a = decision({ id: "a", affectedEntities: [leadEntity("lead_1")] });
    const b = decision({ id: "b", affectedEntities: [leadEntity("lead_1")] });
    const [merged] = consolidateDecisions([a, b]);
    expect(merged.rationale).toContain("Consolidated");
  });

  it("is deterministic regardless of input order (same primary chosen either way)", () => {
    const a = decision({ id: "a", priority: "HIGH", affectedEntities: [leadEntity("lead_1")] });
    const b = decision({ id: "b", priority: "HIGH", affectedEntities: [leadEntity("lead_1")] });
    const [mergedForward] = consolidateDecisions([a, b]);
    const [mergedBackward] = consolidateDecisions([b, a]);
    expect(mergedForward.id).toBe(mergedBackward.id);
  });

  it("passes through a list with no shared entities/categories entirely unmerged (today's real 6-recommendation case)", () => {
    const decisions = [
      decision({ id: "a", category: "FOLLOW_UP", affectedEntities: [leadEntity("lead_1")] }),
      decision({ id: "b", category: "LEAD_PRIORITIZATION", affectedEntities: [leadEntity("lead_2")] }),
      decision({ id: "c", category: "DATA_INTEGRITY", affectedEntities: [] }),
    ];
    expect(consolidateDecisions(decisions)).toHaveLength(3);
  });
});

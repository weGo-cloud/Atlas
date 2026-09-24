import { describe, expect, it } from "vitest";

import { rankDecisions } from "../rank";
import { leadEntity } from "./fixtures";
import type { Decision } from "../decision";

const NOW = "2026-09-02T12:00:00.000Z";

function decision(id: string, score: number, entityCount = 1): Decision {
  return {
    id,
    title: "t",
    summary: "s",
    category: "FOLLOW_UP",
    priority: "MEDIUM",
    score,
    rationale: "r",
    evidence: [],
    predictive: { available: [], unavailableCount: 0 },
    sourceRecommendations: ["review_overdue_follow_ups"],
    affectedEntities: Array.from({ length: entityCount }, (_, i) => leadEntity(`lead_${i}`)),
    suggestedAction: { label: "Review", href: null },
    generatedAt: NOW,
    confidence: { kind: "deterministic" },
  };
}

describe("rankDecisions", () => {
  it("orders by score, descending", () => {
    const ranked = rankDecisions([decision("low", 100), decision("high", 300), decision("mid", 200)]);
    expect(ranked.map((d) => d.id)).toEqual(["high", "mid", "low"]);
  });

  it("breaks a score tie by affected-entity count, descending", () => {
    const ranked = rankDecisions([decision("few", 200, 1), decision("many", 200, 5)]);
    expect(ranked.map((d) => d.id)).toEqual(["many", "few"]);
  });

  it("breaks a full tie (score and entity count) by id, ascending", () => {
    const ranked = rankDecisions([decision("zebra", 200, 1), decision("apple", 200, 1)]);
    expect(ranked.map((d) => d.id)).toEqual(["apple", "zebra"]);
  });

  it("never mutates the input array", () => {
    const input = [decision("a", 100), decision("b", 300)];
    const inputCopy = [...input];
    rankDecisions(input);
    expect(input).toEqual(inputCopy);
  });

  it("is deterministic and total — repeated runs and reordered input produce the same output", () => {
    const decisions = [decision("a", 300), decision("b", 100), decision("c", 200)];
    const first = rankDecisions(decisions);
    const second = rankDecisions([...decisions].reverse());
    expect(first.map((d) => d.id)).toEqual(second.map((d) => d.id));
  });
});

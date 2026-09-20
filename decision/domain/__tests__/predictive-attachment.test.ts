import { describe, expect, it, vi } from "vitest";

import { attachPredictiveEvidence } from "../predictive-attachment";
import type { DecisionPredictionSource } from "../predictive-attachment";
import type { DraftDecision } from "../rules";
import { leadEntity, dealEntity } from "./fixtures";
import type { Prediction } from "../../../predictive/domain/prediction";

const NOW = "2026-09-02T12:00:00.000Z";

function draft(overrides: Partial<DraftDecision> = {}): DraftDecision {
  return {
    id: "review_overdue_follow_ups",
    title: "t",
    summary: "s",
    rationale: "r",
    category: "FOLLOW_UP",
    priority: "MEDIUM",
    evidence: [],
    sourceRecommendations: ["review_overdue_follow_ups"],
    affectedEntities: [leadEntity("lead_1")],
    suggestedAction: { label: "Review", href: null },
    ...overrides,
  };
}

function availablePrediction(leadId: string, probability: number): Prediction {
  return {
    id: `p_${leadId}`,
    type: "lead_conversion",
    entityType: "lead",
    entityId: leadId,
    generatedAt: NOW,
    status: "AVAILABLE",
    probability,
    class: probability >= 0.5 ? "positive" : "negative",
    model: { modelVersion: "lead-conversion-v1", featureVersion: "v1", trainedAt: NOW, trainingDataCutoff: NOW, algorithm: "logistic-regression" },
    evidence: [],
  };
}

function unavailablePrediction(leadId: string, status: "INSUFFICIENT_DATA" | "MODEL_NOT_READY" | "UNSUPPORTED" | "ERROR"): Prediction {
  return { id: `p_${leadId}`, type: "lead_conversion", entityType: "lead", entityId: leadId, generatedAt: NOW, status, reason: "n/a" };
}

function fakeSource(responses: Record<string, Prediction>): DecisionPredictionSource {
  return {
    predictLeadConversion: vi.fn(async (leadId: string) => responses[leadId]),
  };
}

describe("attachPredictiveEvidence", () => {
  it("returns empty/zero immediately for a non-eligible draft, without calling the source", async () => {
    const source = fakeSource({});
    const result = await attachPredictiveEvidence(draft(), false, source, NOW);
    expect(result).toEqual({ available: [], unavailableCount: 0 });
    expect(source.predictLeadConversion).not.toHaveBeenCalled();
  });

  it("returns empty/zero when the draft has no lead entities, even if eligible", async () => {
    const source = fakeSource({});
    const result = await attachPredictiveEvidence(draft({ affectedEntities: [dealEntity("deal_1")] }), true, source, NOW);
    expect(result).toEqual({ available: [], unavailableCount: 0 });
  });

  it("includes an AVAILABLE prediction as evidence", async () => {
    const source = fakeSource({ lead_1: availablePrediction("lead_1", 0.72) });
    const result = await attachPredictiveEvidence(draft(), true, source, NOW);
    expect(result.available).toEqual([
      { entityId: "lead_1", entityType: "lead", entityLabel: "Lead lead_1", probability: 0.72, class: "positive", modelVersion: "lead-conversion-v1" },
    ]);
    expect(result.unavailableCount).toBe(0);
  });

  it.each(["INSUFFICIENT_DATA", "MODEL_NOT_READY", "UNSUPPORTED", "ERROR"] as const)(
    "counts a %s prediction as unavailable, never as evidence",
    async (status) => {
      const source = fakeSource({ lead_1: unavailablePrediction("lead_1", status) });
      const result = await attachPredictiveEvidence(draft(), true, source, NOW);
      expect(result.available).toEqual([]);
      expect(result.unavailableCount).toBe(1);
    }
  );

  it("handles a mix of available and unavailable predictions across multiple entities", async () => {
    const multiDraft = draft({ affectedEntities: [leadEntity("lead_1"), leadEntity("lead_2"), leadEntity("lead_3")] });
    const source = fakeSource({
      lead_1: availablePrediction("lead_1", 0.6),
      lead_2: unavailablePrediction("lead_2", "INSUFFICIENT_DATA"),
      lead_3: availablePrediction("lead_3", 0.3),
    });
    const result = await attachPredictiveEvidence(multiDraft, true, source, NOW);
    expect(result.available).toHaveLength(2);
    expect(result.unavailableCount).toBe(1);
  });

  it("fetches predictions for independent entities in parallel, not sequentially", async () => {
    const multiDraft = draft({ affectedEntities: [leadEntity("lead_1"), leadEntity("lead_2")] });
    const calls: string[] = [];
    const source: DecisionPredictionSource = {
      predictLeadConversion: async (leadId) => {
        calls.push(`start:${leadId}`);
        await new Promise((r) => setTimeout(r, 5));
        calls.push(`end:${leadId}`);
        return availablePrediction(leadId, 0.5);
      },
    };
    await attachPredictiveEvidence(multiDraft, true, source, NOW);
    // If sequential, order would be start:1, end:1, start:2, end:2 — parallel starts both before either ends.
    expect(calls.slice(0, 2).sort()).toEqual(["start:lead_1", "start:lead_2"]);
  });
});

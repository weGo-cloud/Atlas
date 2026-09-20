import { describe, expect, it, vi } from "vitest";

import { evaluateDecisions } from "../engine";
import { recommendation, leadEntity, dealEntity, LAST_30_RANGE } from "./fixtures";
import type { DecisionContext } from "../context";
import type { DecisionPredictionSource } from "../predictive-attachment";
import type { Prediction } from "../../../predictive/domain/prediction";

const NOW = "2026-09-02T12:00:00.000Z";

function context(recommendations: DecisionContext["recommendations"]): DecisionContext {
  return { dateRange: LAST_30_RANGE, recommendations };
}

function noPredictionsSource(): DecisionPredictionSource {
  return { predictLeadConversion: vi.fn(async (leadId): Promise<Prediction> => ({ id: leadId, type: "lead_conversion", entityType: "lead", entityId: leadId, generatedAt: NOW, status: "MODEL_NOT_READY", reason: "n/a" })) };
}

function availableSource(probabilities: Record<string, number>): DecisionPredictionSource {
  return {
    predictLeadConversion: vi.fn(async (leadId): Promise<Prediction> => ({
      id: leadId,
      type: "lead_conversion",
      entityType: "lead",
      entityId: leadId,
      generatedAt: NOW,
      status: "AVAILABLE",
      probability: probabilities[leadId] ?? 0.5,
      class: (probabilities[leadId] ?? 0.5) >= 0.5 ? "positive" : "negative",
      model: { modelVersion: "lead-conversion-v1", featureVersion: "v1", trainedAt: NOW, trainingDataCutoff: NOW, algorithm: "logistic-regression" },
      evidence: [],
    })),
  };
}

describe("evaluateDecisions", () => {
  it("produces no decisions when there are no recommendations", async () => {
    const decisions = await evaluateDecisions(context([]), noPredictionsSource(), NOW);
    expect(decisions).toEqual([]);
  });

  it("produces one decision per recommendation for non-overlapping recommendations", async () => {
    const recs = [recommendation("complete_deal_sale_records", "URGENT", { affectedEntities: [dealEntity("deal_1")] }), recommendation("review_sales_decline", "HIGH")];
    const decisions = await evaluateDecisions(context(recs), noPredictionsSource(), NOW);
    expect(decisions).toHaveLength(2);
    expect(decisions.map((d) => d.category).sort()).toEqual(["DATA_INTEGRITY", "SALES_REVIEW"]);
  });

  it("ranks a URGENT deterministic-only decision above a HIGH decision with predictive evidence (tier separation holds end to end)", async () => {
    const recs = [
      recommendation("complete_deal_sale_records", "URGENT", { affectedEntities: [dealEntity("deal_1")] }),
      recommendation("review_overdue_follow_ups", "HIGH", { affectedEntities: [leadEntity("lead_1")] }),
    ];
    const decisions = await evaluateDecisions(context(recs), availableSource({ lead_1: 0.99 }), NOW);
    expect(decisions[0].category).toBe("DATA_INTEGRITY");
    expect(decisions[1].category).toBe("FOLLOW_UP");
  });

  it("attaches available predictive evidence only for predictive-eligible recommendations", async () => {
    const recs = [recommendation("review_stagnant_pipeline", "MEDIUM", { affectedEntities: [leadEntity("lead_1")] })];
    const decisions = await evaluateDecisions(context(recs), availableSource({ lead_1: 0.8 }), NOW);
    expect(decisions[0].predictive.available).toHaveLength(1);
    expect(decisions[0].predictive.available[0].probability).toBe(0.8);
  });

  it("never attaches predictive evidence for non-eligible recommendations, even with lead-shaped entities", async () => {
    const recs = [recommendation("review_weak_lead_conversion", "MEDIUM")];
    const source = availableSource({});
    const decisions = await evaluateDecisions(context(recs), source, NOW);
    expect(decisions[0].predictive).toEqual({ available: [], unavailableCount: 0 });
    expect(source.predictLeadConversion).not.toHaveBeenCalled();
  });

  it("treats an unavailable prediction as no evidence, never as negative evidence", async () => {
    const recs = [recommendation("review_overdue_follow_ups", "HIGH", { affectedEntities: [leadEntity("lead_1")] })];
    const withUnavailable = await evaluateDecisions(context(recs), noPredictionsSource(), NOW);
    const withoutAnyLead = await evaluateDecisions(
      context([recommendation("review_overdue_follow_ups", "HIGH", { affectedEntities: [] })]),
      noPredictionsSource(),
      NOW
    );
    // Score should be identical whether the prediction was unavailable or there was no lead at all —
    // an unavailable prediction must never act as a de facto "0% probability" penalty.
    expect(withUnavailable[0].score).toBe(withoutAnyLead[0].score);
    expect(withUnavailable[0].predictive.unavailableCount).toBe(1);
  });

  it("is deterministic — identical inputs produce identical output, including ordering", async () => {
    const recs = [
      recommendation("review_sales_decline", "HIGH"),
      recommendation("complete_deal_sale_records", "URGENT", { affectedEntities: [dealEntity("deal_1")] }),
      recommendation("review_overdue_follow_ups", "MEDIUM", { affectedEntities: [leadEntity("lead_1")] }),
    ];
    const a = await evaluateDecisions(context(recs), availableSource({ lead_1: 0.6 }), NOW);
    const b = await evaluateDecisions(context(recs), availableSource({ lead_1: 0.6 }), NOW);
    expect(a).toEqual(b);
  });
});

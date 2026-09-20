import { describe, expect, it } from "vitest";

import { trainLeadConversionModel } from "../trainer";
import type { LeadConversionExample } from "../dataset-builder";
import { LEAD_CONVERSION_FEATURE_NAMES } from "../feature-builder";

const NOW = "2026-09-02T00:00:00.000Z";

/** Deterministic PRNG (mulberry32) — no Math.random, so this test file's synthetic dataset (and therefore every assertion below) is 100% reproducible across runs. */
function makeRng(seed: number) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic examples with a genuine (not perfect) correlation between
 * `activityCount` and the label — enough signal that a correctly
 * implemented logistic regression should beat a majority-class
 * baseline, without being so cleanly separable that it proves
 * nothing. This is explicitly a mechanics test, not a claim about any
 * real business's data — see trainer.ts's own doc comment.
 */
function makeSyntheticDataset(count: number): LeadConversionExample[] {
  const rng = makeRng(42);
  const examples: LeadConversionExample[] = [];
  for (let i = 0; i < count; i++) {
    const activityCount = Math.floor(rng() * 10);
    const hadDealCreated = rng() < 0.2 + activityCount * 0.03 ? 1 : 0;
    const noise = rng();
    const label: 0 | 1 = 0.15 + activityCount * 0.05 + hadDealCreated * 0.2 > noise ? 1 : 0;

    const features = LEAD_CONVERSION_FEATURE_NAMES.map((name) => {
      if (name === "activityCount") return activityCount;
      if (name === "hadDealCreated") return hadDealCreated;
      if (name === "manualActivityCount") return Math.floor(activityCount / 2);
      return rng() < 0.3 ? 1 : 0;
    });

    examples.push({
      leadId: `lead_${i}`,
      observedAt: new Date(2026, 0, 1 + i).toISOString(),
      features,
      label,
    });
  }
  return examples;
}

describe("trainLeadConversionModel — quality gates", () => {
  it("returns NOT_READY (insufficient_observations) for a tiny dataset", () => {
    const result = trainLeadConversionModel(makeSyntheticDataset(10), NOW);
    expect(result.status).toBe("NOT_READY");
    if (result.status === "NOT_READY") expect(result.gate.failedGate).toBe("insufficient_observations");
  });

  it("returns NOT_READY (insufficient_positive_examples) when one class is nearly absent", () => {
    const examples: LeadConversionExample[] = Array.from({ length: 200 }, (_, i) => ({
      leadId: `lead_${i}`,
      observedAt: new Date(2026, 0, 1 + i).toISOString(),
      features: LEAD_CONVERSION_FEATURE_NAMES.map(() => 0),
      label: i < 3 ? 1 : 0, // only 3 positives across 200 examples
    }));
    const result = trainLeadConversionModel(examples, NOW);
    expect(result.status).toBe("NOT_READY");
    if (result.status === "NOT_READY") expect(result.gate.failedGate).toBe("insufficient_positive_examples");
  });

  it("never throws and never produces NaN metrics regardless of gate outcome", () => {
    const result = trainLeadConversionModel(makeSyntheticDataset(500), NOW);
    if (result.status === "READY") {
      for (const value of Object.values(result.artifact.metrics)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});

describe("trainLeadConversionModel — end-to-end on sufficient synthetic data", () => {
  it("reaches READY and beats the baseline on the held-out test set", () => {
    const result = trainLeadConversionModel(makeSyntheticDataset(600), NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;

    expect(result.artifact.metrics.rocAuc).toBeGreaterThan(result.artifact.baselineMetrics.rocAuc);
    expect(result.artifact.metrics.rocAuc).toBeGreaterThan(0.5);
    expect(result.artifact.datasetSummary.totalObservations).toBe(600);
  });

  it("stamps the artifact with correct version/cutoff metadata", () => {
    const result = trainLeadConversionModel(makeSyntheticDataset(600), NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;

    expect(result.artifact.modelVersion).toBe("lead-conversion-v1");
    expect(result.artifact.trainedAt).toBe(NOW);
    expect(result.artifact.trainingDataCutoff).toBe(NOW);
    expect(result.artifact.model.featureNames).toEqual([...LEAD_CONVERSION_FEATURE_NAMES]);
  });

  it("is deterministic — training twice on identical data yields an identical artifact", () => {
    const dataset = makeSyntheticDataset(600);
    const a = trainLeadConversionModel(dataset, NOW);
    const b = trainLeadConversionModel(dataset, NOW);
    expect(a).toEqual(b);
  });
});

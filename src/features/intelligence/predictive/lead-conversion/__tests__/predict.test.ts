import { describe, expect, it } from "vitest";

import { buildLeadConversionPrediction } from "../predict";
import { trainLeadConversionModel } from "../trainer";
import { LEAD_CONVERSION_FEATURE_NAMES, type LeadConversionFeatures } from "../feature-builder";
import type { LeadConversionExample } from "../dataset-builder";

const NOW = "2026-09-02T00:00:00.000Z";

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

function makeSyntheticDataset(count: number): LeadConversionExample[] {
  const rng = makeRng(7);
  const examples: LeadConversionExample[] = [];
  for (let i = 0; i < count; i++) {
    const activityCount = Math.floor(rng() * 10);
    const hadDealCreated = rng() < 0.2 + activityCount * 0.03 ? 1 : 0;
    const noise = rng();
    const label: 0 | 1 = 0.15 + activityCount * 0.05 + hadDealCreated * 0.2 > noise ? 1 : 0;
    const features = LEAD_CONVERSION_FEATURE_NAMES.map((name) => {
      if (name === "activityCount") return activityCount;
      if (name === "hadDealCreated") return hadDealCreated;
      return 0;
    });
    examples.push({ leadId: `lead_${i}`, observedAt: new Date(2026, 0, 1 + i).toISOString(), features, label });
  }
  return examples;
}

function trainedArtifact() {
  const result = trainLeadConversionModel(makeSyntheticDataset(600), NOW);
  if (result.status !== "READY") throw new Error("expected READY for this test's fixture");
  return result.artifact;
}

const ZERO_FEATURES: LeadConversionFeatures = {
  hasVehicleInterest: 0,
  activityCount: 0,
  manualActivityCount: 0,
  statusChangeCount: 0,
  reachedQualifiedOrBeyond: 0,
  hadDealCreated: 0,
  followUpScheduledCount: 0,
  followUpCompletedCount: 0,
  daysSinceLastActivity: 7,
};

describe("buildLeadConversionPrediction", () => {
  it("produces a probability in [0, 1]", () => {
    const prediction = buildLeadConversionPrediction(trainedArtifact(), "lead_1", ZERO_FEATURES, NOW);
    expect(prediction.status).toBe("AVAILABLE");
    if (prediction.status !== "AVAILABLE") return;
    expect(prediction.probability).toBeGreaterThanOrEqual(0);
    expect(prediction.probability).toBeLessThanOrEqual(1);
  });

  it("assigns class 'positive' iff probability >= 0.5", () => {
    const prediction = buildLeadConversionPrediction(trainedArtifact(), "lead_1", ZERO_FEATURES, NOW);
    if (prediction.status !== "AVAILABLE") return;
    expect(prediction.class).toBe(prediction.probability >= 0.5 ? "positive" : "negative");
  });

  it("carries the model identity through from the artifact", () => {
    const artifact = trainedArtifact();
    const prediction = buildLeadConversionPrediction(artifact, "lead_1", ZERO_FEATURES, NOW);
    if (prediction.status !== "AVAILABLE") return;
    expect(prediction.model.modelVersion).toBe(artifact.modelVersion);
    expect(prediction.model.featureVersion).toBe(artifact.featureVersion);
    expect(prediction.model.trainedAt).toBe(artifact.trainedAt);
  });

  it("evidence covers every feature and is sorted by contribution magnitude, descending", () => {
    const prediction = buildLeadConversionPrediction(trainedArtifact(), "lead_1", { ...ZERO_FEATURES, activityCount: 9, hadDealCreated: 1 }, NOW);
    if (prediction.status !== "AVAILABLE") return;
    expect(prediction.evidence).toHaveLength(LEAD_CONVERSION_FEATURE_NAMES.length);
    for (let i = 1; i < prediction.evidence.length; i++) {
      expect(Math.abs(prediction.evidence[i - 1].contribution)).toBeGreaterThanOrEqual(Math.abs(prediction.evidence[i].contribution));
    }
  });

  it("is deterministic for identical inputs", () => {
    const artifact = trainedArtifact();
    const a = buildLeadConversionPrediction(artifact, "lead_1", ZERO_FEATURES, NOW);
    const b = buildLeadConversionPrediction(artifact, "lead_1", ZERO_FEATURES, NOW);
    expect(a).toEqual(b);
  });
});

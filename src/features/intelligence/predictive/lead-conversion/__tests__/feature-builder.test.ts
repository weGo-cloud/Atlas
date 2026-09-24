import { describe, expect, it } from "vitest";

import { buildLeadConversionFeatures, featuresToVector, LEAD_CONVERSION_FEATURE_NAMES } from "../feature-builder";
import type { Activity } from "../../../../activities/domain/activity";

const LEAD = { createdAt: "2026-01-01T00:00:00.000Z", vehicleLabel: "2020 Toyota Fielder" };
const CUTOFF = "2026-01-08T00:00:00.000Z"; // createdAt + 7 days

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: "activity_1",
    businessId: "biz_test",
    customerId: "cust_1",
    leadId: "lead_1",
    userId: "user_1",
    type: "note",
    content: "",
    metadata: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildLeadConversionFeatures — leakage boundary", () => {
  it("excludes an activity created after the observation cutoff entirely", () => {
    const afterCutoff = activity({ type: "deal_created", createdAt: "2026-01-09T00:00:00.000Z", metadata: { dealId: "deal_1" } });
    const features = buildLeadConversionFeatures(LEAD, [afterCutoff], CUTOFF);
    expect(features.hadDealCreated).toBe(0);
    expect(features.activityCount).toBe(0);
  });

  it("includes an activity created exactly at the cutoff (inclusive boundary)", () => {
    const atCutoff = activity({ type: "note", createdAt: CUTOFF });
    const features = buildLeadConversionFeatures(LEAD, [atCutoff], CUTOFF);
    expect(features.activityCount).toBe(1);
  });

  it("a status_change to a terminal/advanced status after the cutoff does not mark reachedQualifiedOrBeyond", () => {
    const late = activity({
      type: "status_change",
      createdAt: "2026-01-10T00:00:00.000Z",
      metadata: { fromStatus: "new", toStatus: "won" },
    });
    const features = buildLeadConversionFeatures(LEAD, [late], CUTOFF);
    expect(features.reachedQualifiedOrBeyond).toBe(0);
    expect(features.statusChangeCount).toBe(0);
  });
});

describe("buildLeadConversionFeatures — feature correctness", () => {
  it("derives hasVehicleInterest from lead.vehicleLabel", () => {
    expect(buildLeadConversionFeatures(LEAD, [], CUTOFF).hasVehicleInterest).toBe(1);
    expect(buildLeadConversionFeatures({ ...LEAD, vehicleLabel: null }, [], CUTOFF).hasVehicleInterest).toBe(0);
  });

  it("counts manual activity types but not automatic ones", () => {
    const activities = [
      activity({ type: "call", createdAt: "2026-01-02T00:00:00.000Z" }),
      activity({ type: "email", createdAt: "2026-01-03T00:00:00.000Z" }),
      activity({ type: "lead_created", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const features = buildLeadConversionFeatures(LEAD, activities, CUTOFF);
    expect(features.manualActivityCount).toBe(2);
    expect(features.activityCount).toBe(3);
  });

  it("marks reachedQualifiedOrBeyond only for statuses at/beyond qualified, within the window", () => {
    const onlyContacted = [
      activity({ type: "status_change", createdAt: "2026-01-02T00:00:00.000Z", metadata: { fromStatus: "new", toStatus: "contacted" } }),
    ];
    expect(buildLeadConversionFeatures(LEAD, onlyContacted, CUTOFF).reachedQualifiedOrBeyond).toBe(0);

    const reachedQualified = [
      activity({ type: "status_change", createdAt: "2026-01-03T00:00:00.000Z", metadata: { fromStatus: "contacted", toStatus: "qualified" } }),
    ];
    expect(buildLeadConversionFeatures(LEAD, reachedQualified, CUTOFF).reachedQualifiedOrBeyond).toBe(1);
  });

  it("marks hadDealCreated when a deal_created activity falls within the window", () => {
    const activities = [activity({ type: "deal_created", createdAt: "2026-01-04T00:00:00.000Z", metadata: { dealId: "deal_1" } })];
    expect(buildLeadConversionFeatures(LEAD, activities, CUTOFF).hadDealCreated).toBe(1);
  });

  it("counts follow-up scheduled/completed activities separately", () => {
    const activities = [
      activity({ type: "follow_up_scheduled", createdAt: "2026-01-02T00:00:00.000Z" }),
      activity({ type: "follow_up_scheduled", createdAt: "2026-01-03T00:00:00.000Z" }),
      activity({ type: "follow_up_completed", createdAt: "2026-01-04T00:00:00.000Z" }),
    ];
    const features = buildLeadConversionFeatures(LEAD, activities, CUTOFF);
    expect(features.followUpScheduledCount).toBe(2);
    expect(features.followUpCompletedCount).toBe(1);
  });

  it("computes daysSinceLastActivity from the most recent in-window activity", () => {
    const activities = [
      activity({ type: "note", createdAt: "2026-01-02T00:00:00.000Z" }),
      activity({ type: "call", createdAt: "2026-01-05T00:00:00.000Z" }),
    ];
    // CUTOFF is 2026-01-08; last activity 2026-01-05 -> 3 days.
    expect(buildLeadConversionFeatures(LEAD, activities, CUTOFF).daysSinceLastActivity).toBeCloseTo(3);
  });

  it("falls back to days-since-creation when there is no activity at all", () => {
    // createdAt 2026-01-01, cutoff 2026-01-08 -> 7 days.
    expect(buildLeadConversionFeatures(LEAD, [], CUTOFF).daysSinceLastActivity).toBeCloseTo(7);
  });

  it("is deterministic and order-independent for the same activity set", () => {
    const activities = [
      activity({ type: "call", createdAt: "2026-01-02T00:00:00.000Z" }),
      activity({ type: "note", createdAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const a = buildLeadConversionFeatures(LEAD, activities, CUTOFF);
    const b = buildLeadConversionFeatures(LEAD, [...activities].reverse(), CUTOFF);
    expect(a).toEqual(b);
  });
});

describe("featuresToVector", () => {
  it("produces a vector matching LEAD_CONVERSION_FEATURE_NAMES order", () => {
    const features = buildLeadConversionFeatures(LEAD, [], CUTOFF);
    const vector = featuresToVector(features);
    expect(vector).toHaveLength(LEAD_CONVERSION_FEATURE_NAMES.length);
    LEAD_CONVERSION_FEATURE_NAMES.forEach((name, i) => {
      expect(vector[i]).toBe(features[name]);
    });
  });
});

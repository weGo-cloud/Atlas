import { describe, expect, it } from "vitest";

import { computeLeadConversionLabel } from "../label-builder";
import type { Activity } from "../../../../activities/domain/activity";

const HORIZON = "2026-01-31T00:00:00.000Z"; // createdAt (2026-01-01) + 30 days

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: "activity_1",
    businessId: "biz_test",
    customerId: "cust_1",
    leadId: "lead_1",
    userId: "user_1",
    type: "deal_status_changed",
    content: "",
    metadata: { dealId: "deal_1", fromStatus: "negotiating", toStatus: "completed" },
    createdAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeLeadConversionLabel", () => {
  it("labels 1 when a deal reaches completed within the horizon", () => {
    expect(computeLeadConversionLabel([activity({})], HORIZON)).toBe(1);
  });

  it("labels 0 when the deal completes AFTER the horizon (the critical leakage boundary)", () => {
    const late = activity({ createdAt: "2026-02-15T00:00:00.000Z" });
    expect(computeLeadConversionLabel([late], HORIZON)).toBe(0);
  });

  it("labels 0 when there is no completed-deal event at all", () => {
    expect(computeLeadConversionLabel([], HORIZON)).toBe(0);
  });

  it("labels 0 when the deal reaches a different terminal status (cancelled)", () => {
    const cancelled = activity({ metadata: { dealId: "deal_1", fromStatus: "negotiating", toStatus: "cancelled" } });
    expect(computeLeadConversionLabel([cancelled], HORIZON)).toBe(0);
  });

  it("ignores deal_created activities (no toStatus, cannot itself signal completion)", () => {
    const created = activity({ type: "deal_created", metadata: { dealId: "deal_1" } });
    expect(computeLeadConversionLabel([created], HORIZON)).toBe(0);
  });

  it("labels 1 when the completed event lands exactly at the horizon (inclusive boundary)", () => {
    const atHorizon = activity({ createdAt: HORIZON });
    expect(computeLeadConversionLabel([atHorizon], HORIZON)).toBe(1);
  });
});

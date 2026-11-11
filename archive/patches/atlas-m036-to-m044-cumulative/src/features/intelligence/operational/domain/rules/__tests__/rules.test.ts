import { describe, expect, it, vi } from "vitest";

import { signal } from "../../__tests__/fixtures";
import type { OperationalEntityResolver } from "../../../entity-resolution/entity-resolver";
import { completeDealSaleRecordsRule } from "../complete-deal-sale-records-rule";
import { reviewOverdueFollowUpsRule } from "../review-overdue-follow-ups-rule";
import { reviewStagnantPipelineRule } from "../review-stagnant-pipeline-rule";
import { reviewWeakLeadConversionRule } from "../review-weak-lead-conversion-rule";
import { reviewSalesDeclineRule } from "../review-sales-decline-rule";
import { reviewInventoryImbalanceRule } from "../review-inventory-imbalance-rule";
import { reviewStaleVehiclesRule } from "../review-stale-vehicles-rule";
import { reviewStaleVehiclesNoActiveLeadRule } from "../review-stale-vehicles-no-active-lead-rule";

const NOW = "2026-09-02T12:00:00.000Z";

function fakeResolver(overrides: Partial<OperationalEntityResolver> = {}): OperationalEntityResolver {
  return {
    resolveOverdueFollowUpLeads: vi.fn().mockResolvedValue([]),
    resolveDealsAwaitingSale: vi.fn().mockResolvedValue([]),
    resolveStagnantPipelineLeads: vi.fn().mockResolvedValue([]),
    resolveStaleVehicles: vi.fn().mockResolvedValue([]),
    resolveStaleVehiclesWithoutActiveLead: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("completeDealSaleRecordsRule", () => {
  it("maps WARNING severity to HIGH priority and CRITICAL to URGENT", () => {
    expect(completeDealSaleRecordsRule.build(signal("completed_deals_awaiting_sale", "WARNING"), NOW).priority).toBe(
      "HIGH"
    );
    expect(completeDealSaleRecordsRule.build(signal("completed_deals_awaiting_sale", "CRITICAL"), NOW).priority).toBe(
      "URGENT"
    );
  });

  it("carries the source signal's evidence and timeRange through unchanged", () => {
    const s = signal("completed_deals_awaiting_sale", "WARNING");
    const rec = completeDealSaleRecordsRule.build(s, NOW);
    expect(rec.evidence).toBe(s.evidence);
    expect(rec.timeRange).toBe(s.timeRange);
    expect(rec.sourceSignal).toBe("completed_deals_awaiting_sale");
    expect(rec.confidence).toEqual({ kind: "deterministic" });
  });

  it("never suggests an autonomous action — only a navigation target", () => {
    const rec = completeDealSaleRecordsRule.build(signal("completed_deals_awaiting_sale", "WARNING"), NOW);
    expect(rec.suggestedAction.href).toBe("/app/deals");
    expect(rec.suggestedAction.label.toLowerCase()).toContain("review");
  });

  it("resolves entities via resolver.resolveDealsAwaitingSale", async () => {
    const dealEntity = { type: "deal" as const, id: "deal_1", label: "2020 Mazda Demio", href: "/app/deals/deal_1" };
    const resolver = fakeResolver({ resolveDealsAwaitingSale: vi.fn().mockResolvedValue([dealEntity]) });
    const entities = await completeDealSaleRecordsRule.resolveEntities!(
      signal("completed_deals_awaiting_sale", "WARNING"),
      resolver,
      NOW
    );
    expect(entities).toEqual([dealEntity]);
  });
});

describe("reviewOverdueFollowUpsRule", () => {
  it("maps WARNING to MEDIUM and CRITICAL to HIGH", () => {
    expect(reviewOverdueFollowUpsRule.build(signal("overdue_follow_up_pressure", "WARNING"), NOW).priority).toBe(
      "MEDIUM"
    );
    expect(reviewOverdueFollowUpsRule.build(signal("overdue_follow_up_pressure", "CRITICAL"), NOW).priority).toBe(
      "HIGH"
    );
  });

  it("resolves entities via resolver.resolveOverdueFollowUpLeads using the engine's `now`", async () => {
    const resolveFn = vi.fn().mockResolvedValue([]);
    const resolver = fakeResolver({ resolveOverdueFollowUpLeads: resolveFn });
    await reviewOverdueFollowUpsRule.resolveEntities!(signal("overdue_follow_up_pressure", "WARNING"), resolver, NOW);
    expect(resolveFn).toHaveBeenCalledWith(NOW);
  });
});

describe("reviewStagnantPipelineRule", () => {
  it("maps WARNING to MEDIUM and CRITICAL to HIGH", () => {
    expect(reviewStagnantPipelineRule.build(signal("stagnant_pipeline", "WARNING"), NOW).priority).toBe("MEDIUM");
    expect(reviewStagnantPipelineRule.build(signal("stagnant_pipeline", "CRITICAL"), NOW).priority).toBe("HIGH");
  });

  it("resolves entities using the signal's own timeRange", async () => {
    const resolveFn = vi.fn().mockResolvedValue([]);
    const resolver = fakeResolver({ resolveStagnantPipelineLeads: resolveFn });
    const s = signal("stagnant_pipeline", "WARNING");
    await reviewStagnantPipelineRule.resolveEntities!(s, resolver, NOW);
    expect(resolveFn).toHaveBeenCalledWith(s.timeRange);
  });
});

describe("reviewWeakLeadConversionRule", () => {
  it("maps WARNING to MEDIUM and CRITICAL to HIGH", () => {
    expect(reviewWeakLeadConversionRule.build(signal("weak_lead_conversion", "WARNING"), NOW).priority).toBe(
      "MEDIUM"
    );
    expect(reviewWeakLeadConversionRule.build(signal("weak_lead_conversion", "CRITICAL"), NOW).priority).toBe("HIGH");
  });

  it("has no entity resolution — aggregate evidence only", () => {
    expect(reviewWeakLeadConversionRule.resolveEntities).toBeUndefined();
  });
});

describe("reviewSalesDeclineRule", () => {
  it("maps WARNING to HIGH and CRITICAL to URGENT", () => {
    expect(reviewSalesDeclineRule.build(signal("declining_sales_trend", "WARNING"), NOW).priority).toBe("HIGH");
    expect(reviewSalesDeclineRule.build(signal("declining_sales_trend", "CRITICAL"), NOW).priority).toBe("URGENT");
  });

  it("has no entity resolution and makes no causal claim in its rationale", () => {
    expect(reviewSalesDeclineRule.resolveEntities).toBeUndefined();
    const rec = reviewSalesDeclineRule.build(signal("declining_sales_trend", "CRITICAL"), NOW);
    expect(rec.rationale.toLowerCase()).not.toContain("because");
  });
});

describe("reviewInventoryImbalanceRule", () => {
  it("maps WARNING to MEDIUM and CRITICAL to HIGH", () => {
    expect(reviewInventoryImbalanceRule.build(signal("inventory_oversupply", "WARNING"), NOW).priority).toBe(
      "MEDIUM"
    );
    expect(reviewInventoryImbalanceRule.build(signal("inventory_oversupply", "CRITICAL"), NOW).priority).toBe(
      "HIGH"
    );
  });

  it("has no entity resolution and makes no demand prediction", () => {
    expect(reviewInventoryImbalanceRule.resolveEntities).toBeUndefined();
    const rec = reviewInventoryImbalanceRule.build(signal("inventory_oversupply", "CRITICAL"), NOW);
    expect(rec.rationale.toLowerCase()).not.toContain("unlikely to sell");
  });
});

describe("reviewStaleVehiclesRule", () => {
  it("maps WARNING to MEDIUM and CRITICAL to HIGH", () => {
    expect(reviewStaleVehiclesRule.build(signal("vehicle_slow_movement", "WARNING"), NOW).priority).toBe("MEDIUM");
    expect(reviewStaleVehiclesRule.build(signal("vehicle_slow_movement", "CRITICAL"), NOW).priority).toBe("HIGH");
  });

  it("resolves entities via resolver.resolveStaleVehicles using the engine's `now`", async () => {
    const resolveFn = vi.fn().mockResolvedValue([]);
    const resolver = fakeResolver({ resolveStaleVehicles: resolveFn });
    await reviewStaleVehiclesRule.resolveEntities!(signal("vehicle_slow_movement", "WARNING"), resolver, NOW);
    expect(resolveFn).toHaveBeenCalledWith(NOW);
  });

  it("makes no market-value or demand claim in its rationale", () => {
    const rec = reviewStaleVehiclesRule.build(signal("vehicle_slow_movement", "CRITICAL"), NOW);
    expect(rec.rationale.toLowerCase()).not.toContain("unlikely to sell");
    expect(rec.rationale.toLowerCase()).not.toContain("market value");
  });
});

describe("reviewStaleVehiclesNoActiveLeadRule (Mission 027)", () => {
  it("maps WARNING to HIGH and CRITICAL to URGENT — a tier above the single-condition rule", () => {
    expect(
      reviewStaleVehiclesNoActiveLeadRule.build(signal("stale_vehicle_no_active_lead", "WARNING"), NOW).priority
    ).toBe("HIGH");
    expect(
      reviewStaleVehiclesNoActiveLeadRule.build(signal("stale_vehicle_no_active_lead", "CRITICAL"), NOW).priority
    ).toBe("URGENT");
  });

  it("resolves entities via resolver.resolveStaleVehiclesWithoutActiveLead using the engine's `now`", async () => {
    const resolveFn = vi.fn().mockResolvedValue([]);
    const resolver = fakeResolver({ resolveStaleVehiclesWithoutActiveLead: resolveFn });
    await reviewStaleVehiclesNoActiveLeadRule.resolveEntities!(
      signal("stale_vehicle_no_active_lead", "WARNING"),
      resolver,
      NOW
    );
    expect(resolveFn).toHaveBeenCalledWith(NOW);
  });

  it("makes no market-value or demand-prediction claim in its rationale", () => {
    const rec = reviewStaleVehiclesNoActiveLeadRule.build(signal("stale_vehicle_no_active_lead", "CRITICAL"), NOW);
    expect(rec.rationale.toLowerCase()).not.toContain("unlikely to sell");
    expect(rec.rationale.toLowerCase()).not.toContain("market value");
    expect(rec.rationale.toLowerCase()).not.toContain("will not sell");
  });

  it("is a distinct recommendation type from review_stale_vehicles", () => {
    expect(reviewStaleVehiclesNoActiveLeadRule.type).not.toBe(reviewStaleVehiclesRule.type);
    expect(reviewStaleVehiclesNoActiveLeadRule.sourceSignalType).toBe("stale_vehicle_no_active_lead");
  });
});

import { describe, expect, it } from "vitest";

import { resolveAction } from "../resolve-action";
import { leadEntity, dealEntity, vehicleEntity } from "../../../decision/domain/__tests__/fixtures";
import type { Decision } from "../../../decision/domain/decision";

const NOW = "2026-09-02T12:00:00.000Z";

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "review_overdue_follow_ups",
    title: "t",
    summary: "s",
    category: "FOLLOW_UP",
    priority: "HIGH",
    score: 300,
    rationale: "r",
    evidence: [],
    predictive: { available: [], unavailableCount: 0 },
    sourceRecommendations: ["review_overdue_follow_ups"],
    affectedEntities: [],
    suggestedAction: { label: "Review and complete overdue follow-ups", href: "/app/leads" },
    generatedAt: NOW,
    confidence: { kind: "deterministic" },
    ...overrides,
  };
}

describe("resolveAction", () => {
  it("resolves to navigate_entity when the decision has an affected entity", () => {
    const lead = leadEntity("lead_1", "Jane Doe");
    const intent = resolveAction(decision({ affectedEntities: [lead] }), NOW);
    expect(intent.type).toBe("navigate_entity");
    expect(intent.href).toBe(lead.href);
    expect(intent.primaryEntity).toEqual(lead);
    expect(intent.label).toBe("Review Lead");
    expect(intent.additionalEntityCount).toBe(0);
  });

  it("targets the first entity and counts the rest when multiple entities are affected", () => {
    const entities = [leadEntity("lead_1"), leadEntity("lead_2"), leadEntity("lead_3")];
    const intent = resolveAction(decision({ affectedEntities: entities }), NOW);
    expect(intent.primaryEntity?.id).toBe("lead_1");
    expect(intent.additionalEntityCount).toBe(2);
  });

  it("labels a deal entity distinctly from a lead entity", () => {
    const deal = dealEntity("deal_1");
    const intent = resolveAction(decision({ category: "DATA_INTEGRITY", affectedEntities: [deal] }), NOW);
    expect(intent.label).toBe("Review Deal");
    expect(intent.href).toBe(deal.href);
  });

  it("labels a vehicle entity as 'Open Vehicle' and links to /app/inventory (Mission 026)", () => {
    const vehicle = vehicleEntity("vehicle_1", "2020 Toyota Fielder");
    const intent = resolveAction(decision({ category: "INVENTORY_REVIEW", affectedEntities: [vehicle] }), NOW);
    expect(intent.type).toBe("navigate_entity");
    expect(intent.label).toBe("Open Vehicle");
    expect(intent.href).toBe(vehicle.href);
    expect(intent.href).toMatch(/^\/app\/inventory\//);
  });

  it("falls back to navigate_workflow using suggestedAction.href when there is no affected entity", () => {
    const intent = resolveAction(
      decision({ category: "SALES_REVIEW", affectedEntities: [], suggestedAction: { label: "Review sales performance", href: "/app/analytics" } }),
      NOW
    );
    expect(intent.type).toBe("navigate_workflow");
    expect(intent.href).toBe("/app/analytics");
    expect(intent.label).toBe("Open Sales Analysis");
    expect(intent.primaryEntity).toBeNull();
  });

  it("falls back to the aggregate inventory workflow when an INVENTORY_REVIEW decision has no specific vehicle", () => {
    const intent = resolveAction(
      decision({ category: "INVENTORY_REVIEW", affectedEntities: [], suggestedAction: { label: "Review inventory", href: "/app/inventory" } }),
      NOW
    );
    expect(intent.type).toBe("navigate_workflow");
    expect(intent.label).toBe("Open Inventory");
    expect(intent.href).toBe("/app/inventory");
  });

  it("resolves to not_supported when there is neither an entity nor a workflow href", () => {
    const intent = resolveAction(decision({ affectedEntities: [], suggestedAction: { label: "n/a", href: null } }), NOW);
    expect(intent.type).toBe("not_supported");
    expect(intent.href).toBeNull();
    expect(intent.requiresConfirmation).toBe(false);
  });

  it("requires confirmation for every resolvable action type", () => {
    expect(resolveAction(decision({ affectedEntities: [leadEntity("lead_1")] }), NOW).requiresConfirmation).toBe(true);
    expect(resolveAction(decision({ affectedEntities: [] }), NOW).requiresConfirmation).toBe(true);
  });

  it("carries provenance back to the originating decision", () => {
    const d = decision({ id: "review_stagnant_pipeline" });
    const intent = resolveAction(d, NOW);
    expect(intent.decisionId).toBe("review_stagnant_pipeline");
    expect(intent.id).toContain("review_stagnant_pipeline");
  });

  it("stamps generatedAt with the given `now`, never the real clock", () => {
    const intent = resolveAction(decision(), NOW);
    expect(intent.generatedAt).toBe(NOW);
  });

  it("is deterministic — identical decision and `now` produce an identical intent", () => {
    const d = decision({ affectedEntities: [leadEntity("lead_1")] });
    expect(resolveAction(d, NOW)).toEqual(resolveAction(d, NOW));
  });

  it("never returns a href outside the decision's own affectedEntities/suggestedAction (no fabricated destination)", () => {
    const lead = leadEntity("lead_1");
    const d = decision({ affectedEntities: [lead], suggestedAction: { label: "x", href: "/app/somewhere-else" } });
    const intent = resolveAction(d, NOW);
    expect(intent.href).toBe(lead.href);
    expect(intent.href).not.toBe("/app/somewhere-else");
  });
});

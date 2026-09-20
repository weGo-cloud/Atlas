import type { ResolvedDateRange } from "../../../../analytics/domain/date-range";
import type { AffectedEntity } from "../../../operational/domain/affected-entity";
import type { Priority } from "../../../operational/domain/priority";
import type { Recommendation, RecommendationType } from "../../../operational/domain/recommendation";

export const LAST_30_RANGE: ResolvedDateRange = {
  preset: "last30",
  from: "2026-08-03T00:00:00.000Z",
  to: "2026-09-02T00:00:00.000Z",
};

export function recommendation(
  type: RecommendationType,
  priority: Priority,
  overrides: Partial<Recommendation> = {}
): Recommendation {
  return {
    id: type,
    type,
    title: `${type} title`,
    summary: `${type} summary`,
    rationale: `${type} rationale`,
    priority,
    evidence: [{ metric: "test.metric", label: "Test metric", observedValue: 1 }],
    affectedEntities: [],
    suggestedAction: { label: "Review", href: null },
    sourceSignal: "overdue_follow_up_pressure",
    timeRange: LAST_30_RANGE,
    confidence: { kind: "deterministic" },
    generatedAt: "2026-09-02T12:00:00.000Z",
    ...overrides,
  };
}

export function leadEntity(id: string, label = `Lead ${id}`): AffectedEntity {
  return { type: "lead", id, label, href: `/app/leads/${id}` };
}

export function dealEntity(id: string, label = `Deal ${id}`): AffectedEntity {
  return { type: "deal", id, label, href: `/app/deals/${id}` };
}

export function vehicleEntity(id: string, label = `Vehicle ${id}`): AffectedEntity {
  return { type: "vehicle", id, label, href: `/app/inventory/${id}` };
}

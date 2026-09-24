import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DATE_RANGE_PRESET_LABEL } from "../../../analytics/domain/date-range";
import { formatCount } from "../../../analytics/lib/format";
import {
  InsightCard,
  InsightEvidence,
  InsightHeader,
  InsightSection,
  type InsightTone,
} from "../../components/insight";
import type { Recommendation } from "../domain/recommendation";
import { PriorityBadge } from "./priority-badge";

const TONE: Record<Recommendation["priority"], InsightTone> = {
  URGENT: "urgent",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

function formatEvidenceValue(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : String(value);
}

export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  return (
    <InsightCard tone={TONE[recommendation.priority]}>
      <InsightHeader
        title={recommendation.title}
        summary={recommendation.summary}
        aside={<PriorityBadge priority={recommendation.priority} />}
      />

      <InsightSection label="Why">
        <p className="text-sm text-muted-foreground">{recommendation.rationale}</p>
        {recommendation.evidence.length > 0 ? (
          <div className="mt-3">
            <InsightEvidence
              rows={recommendation.evidence.map((item) => ({
                key: item.metric,
                label: item.label,
                value: formatEvidenceValue(item.observedValue),
              }))}
            />
          </div>
        ) : null}
      </InsightSection>

      {recommendation.affectedEntities.length > 0 ? (
        <InsightSection label="Affected records">
          <ul className="flex flex-col gap-1.5">
            {recommendation.affectedEntities.map((entity) => (
              <li key={`${entity.type}-${entity.id}`} className="min-w-0">
                <Link
                  href={entity.href}
                  className="inline-flex max-w-full items-center gap-1 rounded-sm text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="truncate">{entity.label}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </InsightSection>
      ) : null}

      <InsightSection label="Recommendation" className="border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {DATE_RANGE_PRESET_LABEL[recommendation.timeRange.preset]}
          </p>
          {recommendation.suggestedAction.href ? (
            <Button asChild variant="intelligence" size="sm">
              <Link href={recommendation.suggestedAction.href}>{recommendation.suggestedAction.label}</Link>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">{recommendation.suggestedAction.label}</span>
          )}
        </div>
      </InsightSection>
    </InsightCard>
  );
}

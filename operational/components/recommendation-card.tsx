import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DATE_RANGE_PRESET_LABEL } from "../../../analytics/domain/date-range";
import { formatCount } from "../../../analytics/lib/format";
import type { Recommendation } from "../domain/recommendation";
import { PriorityBadge } from "./priority-badge";

const CARD_ACCENT: Record<Recommendation["priority"], string> = {
  URGENT: "border-destructive/30",
  HIGH: "border-warning/25",
  MEDIUM: "border-primary/25",
  LOW: "border-border",
};

function formatEvidenceValue(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : String(value);
}

export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  return (
    <Card className={CARD_ACCENT[recommendation.priority]}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">{recommendation.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{recommendation.summary}</p>
          </div>
          <PriorityBadge priority={recommendation.priority} />
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Why: </span>
          {recommendation.rationale}
        </p>

        {recommendation.evidence.length > 0 ? (
          <div className="mt-4 flex flex-col divide-y divide-border rounded-sm border border-border bg-surface-2/40">
            {recommendation.evidence.map((item) => (
              <div key={item.metric} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {formatEvidenceValue(item.observedValue)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {recommendation.affectedEntities.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-subtle-foreground">Affected records</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {recommendation.affectedEntities.map((entity) => (
                <li key={`${entity.type}-${entity.id}`}>
                  <Link
                    href={entity.href}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                  >
                    {entity.label}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-subtle-foreground">{DATE_RANGE_PRESET_LABEL[recommendation.timeRange.preset]}</p>
          {recommendation.suggestedAction.href ? (
            <Button asChild variant="outline" size="sm">
              <Link href={recommendation.suggestedAction.href}>{recommendation.suggestedAction.label}</Link>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">{recommendation.suggestedAction.label}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

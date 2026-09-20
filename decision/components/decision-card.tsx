import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "../../../analytics/lib/format";
import { PriorityBadge } from "../../operational/components/priority-badge";
import { ActionPreviewDialog } from "../../action/components/action-preview-dialog";
import type { Decision } from "../domain/decision";
import { CategoryBadge } from "./category-badge";

const CARD_ACCENT: Record<Decision["priority"], string> = {
  URGENT: "border-destructive/30",
  HIGH: "border-warning/25",
  MEDIUM: "border-primary/25",
  LOW: "border-border",
};

function formatEvidenceValue(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : String(value);
}

/** A prediction is always framed as an estimate, never a guarantee — Section "NO FALSE CERTAINTY". */
function formatProbability(probability: number): string {
  return `~${Math.round(probability * 100)}% estimated conversion likelihood`;
}

export function DecisionCard({ decision }: { decision: Decision }) {
  const { predictive } = decision;

  return (
    <Card className={CARD_ACCENT[decision.priority]}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={decision.category} />
            </div>
            <p className="mt-1.5 text-sm font-medium text-foreground">{decision.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{decision.summary}</p>
          </div>
          <PriorityBadge priority={decision.priority} />
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Why: </span>
          {decision.rationale}
        </p>

        {decision.evidence.length > 0 ? (
          <div className="mt-4 flex flex-col divide-y divide-border rounded-sm border border-border bg-surface-2/40">
            {decision.evidence.map((item) => (
              <div key={item.metric} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {formatEvidenceValue(item.observedValue)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {predictive.available.length > 0 || predictive.unavailableCount > 0 ? (
          <div className="mt-4 rounded-sm border border-intelligence/20 bg-intelligence/5 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-intelligence">
              <TrendingUp className="h-3.5 w-3.5" />
              Predictive evidence
            </div>
            {predictive.available.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {predictive.available.map((p) => (
                  <li key={p.entityId} className="text-sm text-foreground">
                    {p.entityLabel} — {formatProbability(p.probability)}
                  </li>
                ))}
              </ul>
            ) : null}
            {predictive.unavailableCount > 0 ? (
              <p className="mt-1.5 text-xs text-subtle-foreground">
                Predictive evidence unavailable for {predictive.unavailableCount} record
                {predictive.unavailableCount === 1 ? "" : "s"} — not treated as low likelihood, simply not yet
                estimable.
              </p>
            ) : null}
            <p className="mt-1.5 text-xs text-subtle-foreground">
              Estimates based on historical patterns, not guarantees. Model {predictive.available[0]?.modelVersion}.
            </p>
          </div>
        ) : null}

        {decision.affectedEntities.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-subtle-foreground">Affected records</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {decision.affectedEntities.map((entity) => (
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

        <div className="mt-4 flex items-center justify-end gap-3">
          <ActionPreviewDialog decision={decision} />
        </div>
      </CardContent>
    </Card>
  );
}

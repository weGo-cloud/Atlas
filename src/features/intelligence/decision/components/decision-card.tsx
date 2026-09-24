import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";

import { formatCount } from "../../../analytics/lib/format";
import { PriorityBadge } from "../../operational/components/priority-badge";
import { ActionPreviewDialog } from "../../action/components/action-preview-dialog";
import {
  InsightCard,
  InsightEvidence,
  InsightHeader,
  InsightSection,
  type InsightTone,
} from "../../components/insight";
import type { Decision } from "../domain/decision";
import { CategoryBadge } from "./category-badge";

const TONE: Record<Decision["priority"], InsightTone> = {
  URGENT: "urgent",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

function formatEvidenceValue(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : String(value);
}

/** A prediction is always framed as an estimate, never a guarantee — Section "NO FALSE CERTAINTY". */
function formatProbability(probability: number): string {
  return `~${Math.round(probability * 100)}% estimated conversion likelihood`;
}

/**
 * Signal (title/summary) → Why (rationale + evidence) → Action. Same
 * data and wording as before; only the presentation is structured into
 * the Atlas Intelligence flow.
 */
export function DecisionCard({ decision }: { decision: Decision }) {
  const { predictive } = decision;

  return (
    <InsightCard tone={TONE[decision.priority]}>
      <InsightHeader
        meta={<CategoryBadge category={decision.category} />}
        title={decision.title}
        summary={decision.summary}
        aside={<PriorityBadge priority={decision.priority} />}
      />

      <InsightSection label="Why">
        <p className="text-sm text-muted-foreground">{decision.rationale}</p>
        {decision.evidence.length > 0 ? (
          <div className="mt-3">
            <InsightEvidence
              rows={decision.evidence.map((item) => ({
                key: item.metric,
                label: item.label,
                value: formatEvidenceValue(item.observedValue),
              }))}
            />
          </div>
        ) : null}
      </InsightSection>

      {predictive.available.length > 0 || predictive.unavailableCount > 0 ? (
        <InsightSection label="Predictive evidence" icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}>
          <div className="rounded-md border border-intelligence/20 bg-intelligence/5 px-3 py-2.5">
            {predictive.available.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {predictive.available.map((p) => (
                  <li key={p.entityId} className="text-sm text-foreground">
                    {p.entityLabel} — {formatProbability(p.probability)}
                  </li>
                ))}
              </ul>
            ) : null}
            {predictive.unavailableCount > 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Predictive evidence unavailable for {predictive.unavailableCount} record
                {predictive.unavailableCount === 1 ? "" : "s"} — not treated as low likelihood, simply not yet
                estimable.
              </p>
            ) : null}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Estimates based on historical patterns, not guarantees. Model {predictive.available[0]?.modelVersion}.
            </p>
          </div>
        </InsightSection>
      ) : null}

      {decision.affectedEntities.length > 0 ? (
        <InsightSection label="Affected records">
          <ul className="flex flex-col gap-1.5">
            {decision.affectedEntities.map((entity) => (
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

      <InsightSection label="Action" className="border-t border-border pt-4">
        <ActionPreviewDialog decision={decision} />
      </InsightSection>
    </InsightCard>
  );
}

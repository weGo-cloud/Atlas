"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCount } from "../../../analytics/lib/format";
import type { Decision } from "../../decision/domain/decision";
import { resolveAction } from "../domain/resolve-action";

function formatEvidenceValue(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : String(value);
}

/** Section "NO FALSE CERTAINTY" — same framing DecisionCard already uses, never a bare number. */
function formatProbability(probability: number): string {
  return `~${Math.round(probability * 100)}% estimated conversion likelihood`;
}

/**
 * Mission 025 — Section 9/16. This dialog is the "user reviews" step
 * in the required flow (Section 5):
 *
 *   Decision → action available → user clicks → Atlas prepares
 *   context → user reviews → existing workflow opens → user
 *   explicitly confirms/submits → existing domain action executes.
 *
 * Nothing in this component can mutate anything — it renders fields
 * already on `decision` (evidence, predictive, rationale, affected
 * entities) through `resolveAction`'s pure, O(1) mapping, and its
 * only effect on confirm is a normal navigation `<Link>`, the same
 * kind used everywhere else in Atlas. `resolveAction` is given
 * `decision.generatedAt` as `now` — the dialog needs a timestamp for
 * the intent's own provenance, not the real clock, so it reuses the
 * decision's own "as of" time rather than reading the browser clock.
 */
export function ActionPreviewDialog({ decision }: { decision: Decision }) {
  const action = resolveAction(decision, decision.generatedAt);

  if (action.type === "not_supported") {
    return <span className="text-sm text-muted-foreground">{action.label}</span>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {action.label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recommended action</DialogTitle>
          <DialogDescription>{action.explanation}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Why: </span>
            {decision.rationale}
          </p>

          {decision.evidence.length > 0 ? (
            <div className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface-2/40">
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

          {decision.predictive.available.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-subtle-foreground">Prediction</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {decision.predictive.available.map((p) => (
                  <li key={p.entityId} className="text-sm text-foreground">
                    {p.entityLabel} — {formatProbability(p.probability)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-subtle-foreground">Based on available historical data, not a guarantee.</p>
            </div>
          ) : decision.predictive.unavailableCount > 0 ? (
            <p className="text-xs text-subtle-foreground">
              Predictive evidence isn&apos;t available yet for this record — not treated as low likelihood.
            </p>
          ) : null}

          {action.primaryEntity ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-subtle-foreground">Affected record</p>
              <p className="mt-1 text-sm text-foreground">
                {action.primaryEntity.label}
                {action.additionalEntityCount > 0
                  ? ` and ${action.additionalEntityCount} other${action.additionalEntityCount === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button asChild>
            <Link href={action.href} className="inline-flex items-center gap-1.5">
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

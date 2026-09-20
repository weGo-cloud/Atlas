import { Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ModelStatus = { active: false } | { active: true; modelVersion: string; trainedAt: string };

/**
 * Mission 023 — Section 27/28. This is the *entire* predictive
 * surface in the UI for now: a model-status card, never a
 * probability. Section 28 ("no false certainty") and Section 17
 * ("do not display 42% when the underlying sample is inadequate")
 * both rule out showing any per-lead prediction until a real model
 * clears its quality gates — see PredictionService/trainer.ts. Once
 * one exists, this is the natural place to add a "Lead Predictions"
 * section (Section 27) alongside it.
 */
export function PredictiveStatusCard({ status }: { status: ModelStatus }) {
  return (
    <Card className="border-intelligence/25">
      <CardContent className="flex items-start gap-3 p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-intelligence/10">
          <Sparkles className="h-4 w-4 text-intelligence" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Predictive intelligence</p>
            <Badge variant={status.active ? "success" : "default"}>{status.active ? "Active" : "Not yet available"}</Badge>
          </div>
          {status.active ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Lead conversion scoring is active (model {status.modelVersion}, trained{" "}
              {new Date(status.trainedAt).toLocaleDateString()}). Predictions are estimates based on historical
              patterns, never guarantees.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Atlas doesn&apos;t yet have enough historical lead data to power reliable conversion predictions. This
              becomes available automatically once enough leads have completed their full follow-up cycle — no
              estimate is shown until then.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

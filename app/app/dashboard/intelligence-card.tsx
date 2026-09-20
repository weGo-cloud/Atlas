import { Sparkles, ChevronRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Signal } from "@/features/intelligence/domain/signal";

/**
 * Mission 021 — replaces the Mission 001 static mock with the real
 * top signals from IntelligenceService. Still intentionally lightweight
 * (a teaser, not the full Intelligence page) — clicking through to
 * /app/intelligence is where the evidence detail lives.
 */
function IntelligenceCard({ signals }: { signals: Signal[] }) {
  const topSignals = signals.slice(0, 3);

  return (
    <Card className="border-intelligence/25">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-intelligence/10">
              <Sparkles className="h-4 w-4 text-intelligence" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-intelligence">
                Atlas Intelligence
              </p>
              <p className="text-sm font-medium text-foreground">
                {signals.length === 0
                  ? "No active signals right now"
                  : `Your business needs attention in ${signals.length} area${signals.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          {signals.length > 0 ? <Badge variant="intelligence">{signals.length} new</Badge> : null}
        </div>

        {topSignals.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {topSignals.map((signal) => (
              <li key={signal.id}>
                <a
                  href="/app/intelligence"
                  className="flex w-full items-start justify-between gap-4 py-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm px-1 -mx-1"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{signal.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{signal.summary}</p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-subtle-foreground" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Atlas checked your inventory, follow-ups, sales trend, and pipeline and found nothing urgent.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export { IntelligenceCard };

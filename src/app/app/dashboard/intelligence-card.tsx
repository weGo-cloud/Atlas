import Link from "next/link";
import { ChevronRight, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Signal } from "@/features/intelligence/domain/signal";

const SEVERITY_DOT: Record<Signal["severity"], string> = {
  CRITICAL: "bg-destructive",
  WARNING: "bg-warning-fill",
  INFO: "bg-primary",
};

const SEVERITY_LABEL: Record<Signal["severity"], string> = {
  CRITICAL: "Critical",
  WARNING: "Warning",
  INFO: "Info",
};

/**
 * Mission 021 — the real top signals from IntelligenceService, as a
 * dashboard teaser (the evidence detail lives on /app/intelligence).
 * Mission 032 — same data and links, presented in the Atlas Intelligence
 * language: a violet-tinted header identifies it as Atlas speaking, and
 * each row reads as a signal with an obvious way through to the action.
 */
function IntelligenceCard({ signals, className }: { signals: Signal[]; className?: string }) {
  const topSignals = signals.slice(0, 3);

  return (
    <Card className={cn("flex flex-col overflow-hidden border-intelligence/25", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-intelligence/15 bg-intelligence/[0.06] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-intelligence/15 text-intelligence"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-intelligence">Atlas Intelligence</h2>
            <p className="text-sm text-foreground">
              {signals.length === 0
                ? "No active signals right now"
                : `Your business needs attention in ${signals.length} area${signals.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        {signals.length > 0 ? (
          <Badge variant="intelligence" className="shrink-0">
            {signals.length} new
          </Badge>
        ) : null}
      </div>

      {topSignals.length > 0 ? (
        <>
          <ul className="flex-1 divide-y divide-border">
            {topSignals.map((signal) => (
              <li key={signal.id}>
                <Link
                  href="/app/intelligence"
                  className="group flex min-w-0 items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5"
                >
                  <span
                    role="img"
                    aria-label={`${SEVERITY_LABEL[signal.severity]} signal`}
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[signal.severity])}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{signal.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{signal.summary}</p>
                  </div>
                  <ChevronRight
                    aria-hidden="true"
                    className="mt-1 h-4 w-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-4 py-3 sm:px-5">
            <Button asChild variant="intelligence" size="sm">
              <Link href="/app/intelligence">Review recommendations</Link>
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-start gap-3 px-4 py-6 sm:px-5">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p className="text-sm text-muted-foreground">
            Atlas checked your inventory, follow-ups, sales trend, and pipeline and found nothing urgent.
          </p>
        </div>
      )}
    </Card>
  );
}

export { IntelligenceCard };

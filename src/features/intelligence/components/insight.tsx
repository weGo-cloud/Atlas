import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Atlas Intelligence visual language.
 *
 * Every insight — a decision, a recommendation, a raw signal, the
 * dashboard teaser — reads the same way:
 *
 *   Signal  →  Why  →  Recommendation  →  Action
 *
 * A coloured rail on the card's left edge carries urgency; violet
 * (the intelligence accent) marks the section labels, so anything Atlas
 * surfaced is recognisable at a glance and never confused with
 * ordinary record cards. These are presentation components only: the
 * data, wording and actions come from the callers, unchanged.
 */

type InsightTone = "urgent" | "high" | "medium" | "low" | "info" | "intelligence";

const RAIL_CLASS: Record<InsightTone, string> = {
  urgent: "bg-destructive",
  high: "bg-warning-fill",
  medium: "bg-primary",
  info: "bg-primary",
  low: "bg-border-strong",
  intelligence: "bg-intelligence",
};

function InsightCard({
  tone = "intelligence",
  className,
  children,
}: {
  tone?: InsightTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-1", RAIL_CLASS[tone])}
      />
      <CardContent className="p-4 pl-5 sm:p-5 sm:pl-6">{children}</CardContent>
    </Card>
  );
}

/** Title block: optional category badges above, headline, one-line summary, status badge at the end. */
function InsightHeader({
  meta,
  title,
  summary,
  aside,
}: {
  meta?: ReactNode;
  title: string;
  summary?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        {meta ? <div className="mb-1.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
          {title}
        </h3>
        {summary ? <p className="mt-1 text-sm text-muted-foreground">{summary}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/** A labelled step in the Signal → Why → Recommendation → Action flow. */
function InsightSection({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-4 min-w-0", className)}>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-intelligence">
        {icon}
        {label}
      </h4>
      {children}
    </section>
  );
}

/** Evidence as a compact label/value table. Values are tabular so they align down the card. */
function InsightEvidence({
  rows,
}: {
  rows: { key: string; label: string; value: ReactNode }[];
}) {
  return (
    <dl className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
          <dt className="min-w-0 text-muted-foreground">{row.label}</dt>
          <dd className="shrink-0 text-right font-semibold tabular text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { InsightCard, InsightHeader, InsightSection, InsightEvidence };
export type { InsightTone };

import { AlertTriangle } from "lucide-react";

import { LEAD_ACTIVE_STATUSES, type Lead } from "@/features/leads/domain/lead";

type CustomerLeadSummaryProps = {
  leads: Lead[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Mission 016 — the customer detail page's CRM-at-a-glance row.
 * Derived entirely from the customer's own leads (no new queries,
 * no new stored fields) — same source of truth CustomerLeadsList
 * already renders below this.
 */
function CustomerLeadSummary({ leads }: CustomerLeadSummaryProps) {
  const total = leads.length;
  const active = leads.filter((lead) => (LEAD_ACTIVE_STATUSES as readonly string[]).includes(lead.status)).length;
  const won = leads.filter((lead) => lead.status === "won").length;
  const lost = leads.filter((lead) => lead.status === "lost").length;

  const today = new Date().toISOString().slice(0, 10);
  const followUps = leads
    .filter((lead) => lead.nextFollowUpAt && (LEAD_ACTIVE_STATUSES as readonly string[]).includes(lead.status))
    .sort((a, b) => (a.nextFollowUpAt! < b.nextFollowUpAt! ? -1 : 1));
  const nextFollowUp = followUps[0] ?? null;
  const overdueCount = followUps.filter((lead) => lead.nextFollowUpAt!.slice(0, 10) < today).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-muted-foreground">Total leads</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{total}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-muted-foreground">Active</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{active}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-muted-foreground">Won</p>
        <p className="mt-1 text-xl font-semibold text-success">{won}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs text-muted-foreground">Lost</p>
        <p className="mt-1 text-xl font-semibold text-destructive">{lost}</p>
      </div>
      {nextFollowUp && (
        <div className="col-span-2 flex items-center gap-2 rounded-lg border border-border bg-surface p-3 sm:col-span-4">
          {overdueCount > 0 && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
          <p className="text-xs text-muted-foreground">
            Next follow-up{" "}
            <span className={overdueCount > 0 ? "font-medium text-destructive" : "font-medium text-foreground"}>
              {formatDate(nextFollowUp.nextFollowUpAt!)}
            </span>
            {overdueCount > 0 && ` · ${overdueCount} overdue`}
          </p>
        </div>
      )}
    </div>
  );
}

export { CustomerLeadSummary };

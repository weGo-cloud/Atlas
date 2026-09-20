"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from "../domain/lead";

type StatusOption = LeadStatus | "all";

const STATUS_OPTIONS: StatusOption[] = ["all", ...LEAD_STATUSES];

function statusLabel(status: StatusOption): string {
  return status === "all" ? "All" : LEAD_STATUS_LABEL[status];
}

type LeadsToolbarProps = {
  activeStatus?: LeadStatus;
  followUpOnly?: boolean;
};

function LeadsToolbar({ activeStatus, followUpOnly }: LeadsToolbarProps) {
  const router = useRouter();

  const navigate = (nextStatus: StatusOption, nextFollowUpOnly: boolean) => {
    const params = new URLSearchParams();
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextFollowUpOnly) params.set("followUp", "due");
    const qs = params.toString();
    router.push(qs ? `/app/leads?${qs}` : "/app/leads");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Filter by status"
        className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-surface p-1"
      >
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={(activeStatus ?? "all") === status}
            onClick={() => navigate(status, Boolean(followUpOnly))}
            className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
              (activeStatus ?? "all") === status
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {statusLabel(status)}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-pressed={Boolean(followUpOnly)}
        onClick={() => navigate(activeStatus ?? "all", !followUpOnly)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          followUpOnly
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-border bg-surface text-muted-foreground hover:text-foreground"
        }`}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Needs follow-up
      </button>
    </div>
  );
}

export { LeadsToolbar };

"use client";

import { useRouter } from "next/navigation";

import { DEAL_STATUSES, DEAL_STATUS_LABEL, type DealStatus } from "../domain/deal";

type StatusOption = DealStatus | "all";

const STATUS_OPTIONS: StatusOption[] = ["all", ...DEAL_STATUSES];

function statusLabel(status: StatusOption): string {
  return status === "all" ? "All" : DEAL_STATUS_LABEL[status];
}

type DealsToolbarProps = {
  activeStatus?: DealStatus;
};

function DealsToolbar({ activeStatus }: DealsToolbarProps) {
  const router = useRouter();

  const navigate = (nextStatus: StatusOption) => {
    const params = new URLSearchParams();
    if (nextStatus !== "all") params.set("status", nextStatus);
    const qs = params.toString();
    router.push(qs ? `/app/deals?${qs}` : "/app/deals");
  };

  return (
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
          onClick={() => navigate(status)}
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
  );
}

export { DealsToolbar };

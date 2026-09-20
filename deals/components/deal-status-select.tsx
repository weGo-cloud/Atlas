"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Select } from "@/components/ui/select";
import { updateDealStatusAction } from "../actions/deal-actions";
import { DEAL_STATUSES, DEAL_STATUS_LABEL, type DealStatus } from "../domain/deal";
import { canTransitionDealStatus } from "../domain/deal-status";

type DealStatusSelectProps = {
  dealId: string;
  status: DealStatus;
};

function DealStatusSelect({ dealId, status }: DealStatusSelectProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const target = event.target.value as DealStatus;
    if (target === status) return;

    setPending(true);
    setError(null);
    const result = await updateDealStatusAction(dealId, target);
    setPending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  };

  // Only present transitions the server will actually accept — see
  // canTransitionDealStatus. Mirrors LeadStatusSelect exactly.
  const selectableStatuses = DEAL_STATUSES.filter(
    (option) => option === status || canTransitionDealStatus(status, option)
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="relative w-40">
        <Select
          value={status}
          onChange={handleChange}
          disabled={pending || selectableStatuses.length <= 1}
          aria-label="Change deal status"
          className="h-8 py-1 text-xs"
        >
          {selectableStatuses.map((option) => (
            <option key={option} value={option}>
              {DEAL_STATUS_LABEL[option]}
            </option>
          ))}
        </Select>
        {pending && (
          <Loader2 className="pointer-events-none absolute right-8 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-subtle-foreground" />
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { DealStatusSelect };

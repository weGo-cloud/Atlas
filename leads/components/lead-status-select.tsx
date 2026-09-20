"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Select } from "@/components/ui/select";
import { updateLeadStatusAction } from "../actions/lead-actions";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from "../domain/lead";
import { canTransitionLeadStatus } from "../domain/lead-status";

type LeadStatusSelectProps = {
  leadId: string;
  status: LeadStatus;
};

function LeadStatusSelect({ leadId, status }: LeadStatusSelectProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const target = event.target.value as LeadStatus;
    if (target === status) return;

    setPending(true);
    const result = await updateLeadStatusAction(leadId, target);
    setPending(false);

    if (!result.ok) {
      window.alert(result.error.message);
      return;
    }
    router.refresh();
  };

  // Mission 015 — only present transitions the server will actually
  // accept (see canTransitionLeadStatus). The current status is always
  // shown too, since it's the select's own value; it's a no-op on
  // reselect, exactly like before.
  const selectableStatuses = LEAD_STATUSES.filter(
    (option) => option === status || canTransitionLeadStatus(status, option)
  );

  return (
    <div className="relative w-36">
      <Select
        value={status}
        onChange={handleChange}
        disabled={pending}
        aria-label="Change lead status"
        className="h-8 py-1 text-xs"
      >
        {selectableStatuses.map((option) => (
          <option key={option} value={option}>
            {LEAD_STATUS_LABEL[option]}
          </option>
        ))}
      </Select>
      {pending && (
        <Loader2 className="pointer-events-none absolute right-8 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-subtle-foreground" />
      )}
    </div>
  );
}

export { LeadStatusSelect };

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { completeLeadFollowUpAction } from "../actions/lead-actions";

type CompleteFollowUpButtonProps = {
  leadId: string;
};

function CompleteFollowUpButton({ leadId }: CompleteFollowUpButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setSubmitting(true);
    setError(null);
    const result = await completeLeadFollowUpAction(leadId);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={submitting} className="gap-1.5">
        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
        Complete follow-up
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { CompleteFollowUpButton };

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateLeadAction } from "../actions/lead-actions";
import type { Lead } from "../domain/lead";

type LeadDetailEditFormProps = {
  lead: Lead;
};

/** ISO datetime -> yyyy-mm-dd for the date input; empty for null. */
function toDateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function LeadDetailEditForm({ lead }: LeadDetailEditFormProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(lead.notes);
  const [nextFollowUpAt, setNextFollowUpAt] = useState(toDateInputValue(lead.nextFollowUpAt));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = notes !== lead.notes || nextFollowUpAt !== toDateInputValue(lead.nextFollowUpAt);

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const result = await updateLeadAction(lead.id, {
      notes,
      nextFollowUpAt: nextFollowUpAt || null,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-detail-follow-up">Next follow-up</Label>
        <Input
          id="lead-detail-follow-up"
          type="date"
          value={nextFollowUpAt}
          onChange={(e) => {
            setNextFollowUpAt(e.target.value);
            setSaved(false);
          }}
          className="max-w-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-detail-notes">Notes</Label>
        <Textarea
          id="lead-detail-notes"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          rows={4}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!dirty || submitting} size="sm" className="w-fit gap-1.5">
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save changes
        </Button>
        {saved && !dirty && <span className="text-xs text-muted-foreground">Saved.</span>}
      </div>
    </div>
  );
}

export { LeadDetailEditForm };

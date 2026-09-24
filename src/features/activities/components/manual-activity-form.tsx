"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createManualActivityAction } from "../actions/activity-actions";
import { ACTIVITY_TYPE_LABEL, MANUAL_ACTIVITY_TYPES, type ManualActivityType } from "../domain/activity";

type ManualActivityFormProps = {
  customerId: string;
  /** Preset when opened from a specific lead's page — always attaches to this lead. */
  leadId?: string;
};

/**
 * Mission 017 — the one manual-activity form, reused by both the
 * customer and lead detail pages. Plain text only, no rich editor,
 * matching Section 11's explicit instruction.
 */
function ManualActivityForm({ customerId, leadId }: ManualActivityFormProps) {
  const router = useRouter();
  const [type, setType] = useState<ManualActivityType>("note");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!content.trim()) {
      setError("Content is required.");
      return;
    }

    setSubmitting(true);
    const result = await createManualActivityAction({ customerId, leadId, type, content });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setContent("");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as ManualActivityType)}
          disabled={submitting}
          aria-label="Activity type"
          className="w-36"
        >
          {MANUAL_ACTIVITY_TYPES.map((option) => (
            <option key={option} value={option}>
              {ACTIVITY_TYPE_LABEL[option]}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">Log an interaction</span>
      </div>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What happened?"
        rows={2}
        disabled={submitting}
        aria-label="Activity content"
      />

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={submitting || !content.trim()}
        size="sm"
        className="w-fit gap-1.5"
      >
        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Add activity
      </Button>
    </div>
  );
}

export { ManualActivityForm };

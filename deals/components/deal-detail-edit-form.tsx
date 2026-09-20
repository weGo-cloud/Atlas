"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateDealAction } from "../actions/deal-actions";
import type { Deal } from "../domain/deal";

type DealDetailEditFormProps = {
  deal: Deal;
};

function DealDetailEditForm({ deal }: DealDetailEditFormProps) {
  const router = useRouter();
  const [agreedPrice, setAgreedPrice] = useState(String(deal.agreedPrice));
  const [depositAmount, setDepositAmount] = useState(deal.depositAmount != null ? String(deal.depositAmount) : "");
  const [notes, setNotes] = useState(deal.notes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const editable = deal.status !== "completed" && deal.status !== "cancelled";

  const dirty =
    agreedPrice !== String(deal.agreedPrice) ||
    depositAmount !== (deal.depositAmount != null ? String(deal.depositAmount) : "") ||
    notes !== deal.notes;

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const result = await updateDealAction(deal.id, {
      agreedPrice: agreedPrice ? Number(agreedPrice) : undefined,
      depositAmount: depositAmount ? Number(depositAmount) : null,
      notes,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  if (!editable) {
    return (
      <p className="text-sm text-muted-foreground">
        This deal is {deal.status} — its terms are part of the historical record and can no longer be edited.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deal-detail-price">Agreed price</Label>
          <Input
            id="deal-detail-price"
            type="number"
            min={0}
            step={1}
            value={agreedPrice}
            onChange={(e) => {
              setAgreedPrice(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deal-detail-deposit">Deposit</Label>
          <Input
            id="deal-detail-deposit"
            type="number"
            min={0}
            step={1}
            value={depositAmount}
            onChange={(e) => {
              setDepositAmount(e.target.value);
              setSaved(false);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="deal-detail-notes">Notes</Label>
        <Textarea
          id="deal-detail-notes"
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

export { DealDetailEditForm };

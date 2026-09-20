"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSaleAction } from "../actions/sale-actions";

type CreateSaleDialogProps = {
  dealId: string;
  /** The deal's own agreed price — shown as the default/starting sale amount (Mission 019, Section 5). */
  defaultSaleAmount: number;
};

/** Mission 019 — finalizes a Sale from a completed Deal. Only rendered by the caller when the deal actually qualifies (completed, no existing sale) and the viewer is an owner — the server action re-enforces both regardless. */
function CreateSaleDialog({ dealId, defaultSaleAmount }: CreateSaleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saleAmount, setSaleAmount] = useState(String(defaultSaleAmount));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const result = await createSaleAction({
      dealId,
      saleAmount: saleAmount ? Number(saleAmount) : undefined,
      notes: notes.trim(),
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setOpen(false);
    router.push(`/app/sales/${result.sale.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Trophy className="h-3.5 w-3.5" />
          Finalize Sale
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Finalize sale</DialogTitle>
          <DialogDescription>
            This creates the permanent, historical sale record for this deal. Once created it can&apos;t be
            edited.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-amount">Final sale amount</Label>
            <Input
              id="sale-amount"
              type="number"
              min={0}
              step={1}
              value={saleAmount}
              onChange={(e) => setSaleAmount(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-notes">Notes (optional)</Label>
            <Textarea id="sale-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Finalize sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CreateSaleDialog };

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Loader2, Search } from "lucide-react";

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
import { searchVehiclesAction } from "@/features/inventory/actions/vehicle-actions";
import type { Vehicle } from "@/features/inventory/data/types";
import { createDealAction } from "../actions/deal-actions";

type CreateDealDialogProps = {
  leadId: string;
  /** The lead's existing vehicle of interest, if any — preselects it and hides the picker (Mission 018, Section 5: default to the lead's vehicle unless deliberately overridden). */
  leadVehicle?: { id: string; label: string } | null;
};

/**
 * Mission 018 — creates a Deal from a Lead. Customer is never asked
 * for here: DealService always derives it from the lead server-side,
 * so there's nothing for this dialog to get wrong on that front.
 */
function CreateDealDialog({ leadId, leadVehicle }: CreateDealDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [changeVehicle, setChangeVehicle] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleResults, setVehicleResults] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const vehicleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [agreedPrice, setAgreedPrice] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showVehiclePicker = !leadVehicle || changeVehicle;

  const resetState = () => {
    setChangeVehicle(false);
    setVehicleSearch("");
    setVehicleResults([]);
    setSelectedVehicle(null);
    setAgreedPrice("");
    setDepositAmount("");
    setNotes("");
    setError(null);
  };

  const handleVehicleSearchChange = (value: string) => {
    setVehicleSearch(value);
    setSelectedVehicle(null);
    if (vehicleDebounce.current) clearTimeout(vehicleDebounce.current);
    vehicleDebounce.current = setTimeout(async () => {
      setVehicleResults(await searchVehiclesAction(value));
    }, 300);
  };

  const handleSubmit = async () => {
    setError(null);

    const vehicleId = !showVehiclePicker ? leadVehicle!.id : selectedVehicle?.id;
    if (showVehiclePicker && !vehicleId) {
      setError("Select a vehicle for this deal.");
      return;
    }

    if (depositAmount && agreedPrice && Number(depositAmount) > Number(agreedPrice)) {
      setError("The deposit cannot exceed the agreed price.");
      return;
    }

    setSubmitting(true);
    const result = await createDealAction({
      leadId,
      vehicleId,
      agreedPrice: agreedPrice ? Number(agreedPrice) : undefined,
      depositAmount: depositAmount ? Number(depositAmount) : null,
      notes: notes.trim(),
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setOpen(false);
    resetState();
    router.push(`/app/deals/${result.deal.id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Handshake className="h-3.5 w-3.5" />
          Create Deal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New deal</DialogTitle>
          <DialogDescription>
            Start a commercial transaction for this lead. The customer is carried over automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {leadVehicle && !changeVehicle ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <div>
                <span className="text-muted-foreground">Vehicle: </span>
                <span className="font-medium text-foreground">{leadVehicle.label}</span>
              </div>
              <button
                type="button"
                onClick={() => setChangeVehicle(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label>Vehicle</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
                <Input
                  value={vehicleSearch}
                  onChange={(e) => handleVehicleSearchChange(e.target.value)}
                  placeholder="Search stock ID, make, or model..."
                  className="pl-9"
                />
              </div>
              {selectedVehicle ? (
                <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium text-foreground">
                    {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedVehicle(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </button>
                </div>
              ) : (
                vehicleResults.length > 0 && (
                  <ul className="max-h-32 overflow-y-auto rounded-md border border-border">
                    {vehicleResults.map((vehicle) => (
                      <li key={vehicle.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVehicle(vehicle);
                            setVehicleResults([]);
                          }}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                        >
                          <span className="font-medium text-foreground">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </span>
                          <span className="text-xs text-muted-foreground">Stock #{vehicle.stockId}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-agreed-price">Agreed price (optional)</Label>
            <Input
              id="deal-agreed-price"
              type="number"
              min={0}
              step={1}
              value={agreedPrice}
              onChange={(e) => setAgreedPrice(e.target.value)}
              placeholder="Defaults to the vehicle's listing price"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-deposit">Deposit (optional)</Label>
            <Input
              id="deal-deposit"
              type="number"
              min={0}
              step={1}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deal-notes">Notes (optional)</Label>
            <Textarea id="deal-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
            Create deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CreateDealDialog };

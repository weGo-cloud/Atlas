"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteVehicleAction } from "../actions/vehicle-actions";

type VehicleDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  make: string;
  model: string;
  stockId: string;
  /**
   * Where to send the user after a successful delete. Pass the
   * inventory list from the detail page (the vehicle no longer
   * exists to view); omit it from the list page, where staying put
   * and refreshing is enough.
   */
  redirectTo?: string;
};

function VehicleDeleteDialog({
  open,
  onOpenChange,
  vehicleId,
  make,
  model,
  stockId,
  redirectTo,
}: VehicleDeleteDialogProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    const result = await deleteVehicleAction(vehicleId);
    setIsDeleting(false);

    if (!result.ok) {
      onOpenChange(false);
      window.alert(result.error.message);
      return;
    }

    onOpenChange(false);

    if (result.outcome.mediaCleanupFailures > 0) {
      // The vehicle is gone either way — this is informational, not
      // blocking, since a few orphaned files on disk are harmless.
      window.alert(
        `Vehicle deleted. ${result.outcome.mediaCleanupFailures} photo file(s) could not be removed from storage and may need manual cleanup.`
      );
    }

    if (redirectTo) {
      router.push(redirectTo);
    }
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete vehicle?</DialogTitle>
          <DialogDescription>
            This will permanently delete{" "}
            <span className="font-medium text-foreground">
              {make} {model}
            </span>{" "}
            (stock ID {stockId}), including its photos. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="gap-1.5"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete vehicle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { VehicleDeleteDialog };

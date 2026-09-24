"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { VehicleStatus } from "../data/types";
import { VehicleDeleteDialog } from "./vehicle-delete-dialog";
import { VehicleStatusMenuItems } from "./vehicle-status-menu-items";

type InventoryRowActionsProps = {
  vehicleId: string;
  make: string;
  model: string;
  stockId: string;
  status: VehicleStatus;
  /**
   * Mission 013: UI-layer reflection of vehicle.delete only — hiding
   * this control is a UX convenience, not the security boundary.
   * deleteVehicleAction enforces the real check server-side
   * regardless of what this prop is set to.
   */
  canDelete: boolean;
};

function InventoryRowActions({
  vehicleId,
  make,
  model,
  stockId,
  status,
  canDelete,
}: InventoryRowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const vehicleLabel = `${make} ${model}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Actions for ${vehicleLabel}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/app/inventory/${vehicleId}`}>View vehicle</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/app/inventory/${vehicleId}/edit`}>Edit</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <VehicleStatusMenuItems vehicleId={vehicleId} currentStatus={status} />
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete vehicle
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canDelete && (
        <VehicleDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          vehicleId={vehicleId}
          make={make}
          model={model}
          stockId={stockId}
        />
      )}
    </>
  );
}

export { InventoryRowActions };

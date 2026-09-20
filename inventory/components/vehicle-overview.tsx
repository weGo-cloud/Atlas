"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Vehicle } from "../data/types";
import { VehicleStatusBadge } from "./status-badge";
import { VehicleDeleteDialog } from "./vehicle-delete-dialog";
import { VehicleStatusMenuItems } from "./vehicle-status-menu-items";

function VehicleOverview({ vehicle, canDelete }: { vehicle: Vehicle; canDelete: boolean }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const vehicleLabel = `${vehicle.make} ${vehicle.model}`;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/app/inventory"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Inventory
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {vehicleLabel}
              </h1>
              <VehicleStatusBadge status={vehicle.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {vehicle.year} · Stock ID: {vehicle.stockId}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button asChild className="gap-1.5">
            <Link href={`/app/inventory/${vehicle.id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit Vehicle
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={`More actions for ${vehicleLabel}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <VehicleStatusMenuItems
                vehicleId={vehicle.id}
                currentStatus={vehicle.status}
              />
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
        </div>
      </div>

      {canDelete && (
        <VehicleDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          vehicleId={vehicle.id}
          make={vehicle.make}
          model={vehicle.model}
          stockId={vehicle.stockId}
          redirectTo="/app/inventory"
        />
      )}
    </div>
  );
}

export { VehicleOverview };

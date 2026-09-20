"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { updateVehicleStatusAction } from "../actions/vehicle-actions";
import { VEHICLE_STATUS_LABEL, type VehicleStatus } from "../data/types";
import { ALLOWED_STATUS_TRANSITIONS } from "../domain/vehicle-status";

type VehicleStatusMenuItemsProps = {
  vehicleId: string;
  currentStatus: VehicleStatus;
};

/**
 * Renders one DropdownMenuItem per status the vehicle is currently
 * allowed to transition to (see domain/vehicle-status.ts) — a sold
 * vehicle never shows a "Mark reserved" item, for example, so the UI
 * can't offer a transition the service layer would reject anyway.
 */
function VehicleStatusMenuItems({
  vehicleId,
  currentStatus,
}: VehicleStatusMenuItemsProps) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<VehicleStatus | null>(
    null
  );

  const allowedTargets = ALLOWED_STATUS_TRANSITIONS[currentStatus];

  const handleSelect = async (target: VehicleStatus) => {
    setPendingStatus(target);
    const result = await updateVehicleStatusAction(vehicleId, target);
    setPendingStatus(null);

    if (!result.ok) {
      window.alert(result.error.message);
      return;
    }

    router.refresh();
  };

  if (allowedTargets.length === 0) return null;

  return (
    <>
      {allowedTargets.map((target) => (
        <DropdownMenuItem
          key={target}
          onSelect={(event) => {
            event.preventDefault();
            void handleSelect(target);
          }}
          disabled={pendingStatus !== null}
        >
          {pendingStatus === target && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          Mark {VEHICLE_STATUS_LABEL[target].toLowerCase()}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export { VehicleStatusMenuItems };

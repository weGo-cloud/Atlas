"use client";

import { CreateLeadDialog } from "./create-lead-dialog";

/**
 * Mission 015 — thin wrapper preserving the original vehicle-page
 * call site and trigger label; the actual dialog logic now lives in
 * the generalized CreateLeadDialog (customer picker only, vehicle
 * preset from this page).
 */
function AddCustomerInterestDialog({ vehicleId }: { vehicleId: string }) {
  return <CreateLeadDialog vehicleId={vehicleId} triggerLabel="Add Customer Interest" />;
}

export { AddCustomerInterestDialog };

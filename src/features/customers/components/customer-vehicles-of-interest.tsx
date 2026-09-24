import Link from "next/link";
import { Car } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Vehicle } from "@/features/inventory/data/types";
import type { Lead } from "@/features/leads/domain/lead";

type CustomerVehiclesOfInterestProps = {
  leads: Lead[];
  vehiclesById: Map<string, Vehicle>;
};

type VehicleOfInterestEntry = {
  key: string;
  vehicle: Vehicle | null;
  label: string;
  leadCount: number;
  mostRecentLeadId: string;
};

/**
 * Mission 016 — "vehicles of interest", not "vehicles owned". Derived
 * entirely from the customer's own leads: no new relationship, no new
 * query. Deliberately doesn't distinguish or rank by outcome — a won
 * lead doesn't mean the customer owns the vehicle, it means Atlas
 * doesn't model a purchase/ownership concept yet (that's a future
 * Deal/Sale mission). Grouped by vehicle (or by the historical
 * vehicleLabel once a vehicle's been deleted) since a customer can
 * have more than one lead against the same vehicle over time.
 */
function CustomerVehiclesOfInterest({ leads, vehiclesById }: CustomerVehiclesOfInterestProps) {
  const withVehicle = leads.filter((lead) => lead.vehicleId || lead.vehicleLabel);
  if (withVehicle.length === 0) return null;

  const grouped = new Map<string, VehicleOfInterestEntry>();
  for (const lead of withVehicle) {
    const vehicle = lead.vehicleId ? (vehiclesById.get(lead.vehicleId) ?? null) : null;
    const key = lead.vehicleId ?? `label:${lead.vehicleLabel}`;
    const label = vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : (lead.vehicleLabel ?? "Unknown vehicle");

    const existing = grouped.get(key);
    if (existing) {
      existing.leadCount += 1;
      // Leads are already newest-first from the service; keep the first (most recent) lead id seen.
    } else {
      grouped.set(key, { key, vehicle, label, leadCount: 1, mostRecentLeadId: lead.id });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicles of interest</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="flex flex-col gap-2">
          {Array.from(grouped.values()).map((entry) => (
            <li
              key={entry.key}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Car className="h-4 w-4 shrink-0 text-subtle-foreground" />
                {entry.vehicle ? (
                  <Link
                    href={`/app/inventory/${entry.vehicle.id}`}
                    className="truncate text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {entry.label}
                  </Link>
                ) : (
                  <span className="truncate text-sm text-muted-foreground">
                    {entry.label} <span className="italic">(no longer in inventory)</span>
                  </span>
                )}
              </div>
              <Link
                href={`/app/leads/${entry.mostRecentLeadId}`}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {entry.leadCount > 1 ? `${entry.leadCount} leads` : "View lead"}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export { CustomerVehiclesOfInterest };

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Vehicle } from "@/features/inventory/data/types";
import type { Lead } from "@/features/leads/domain/lead";
import { LeadStatusBadge } from "@/features/leads/components/lead-status-badge";
import { CreateLeadDialog } from "@/features/leads/components/create-lead-dialog";

function formatLeadDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type CustomerLeadsListProps = {
  customerId: string;
  customerName: string;
  leads: Lead[];
  vehiclesById: Map<string, Vehicle>;
};

function CustomerLeadsList({ customerId, customerName, leads, vehiclesById }: CustomerLeadsListProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Leads &amp; vehicle interest</CardTitle>
        <CreateLeadDialog customerId={customerId} customerName={customerName} triggerLabel="New Lead" />
      </CardHeader>
      <CardContent className="pt-0">
        {leads.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No leads recorded for this customer yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {leads.map((lead) => {
              const vehicle = lead.vehicleId ? vehiclesById.get(lead.vehicleId) : undefined;
              return (
                <li key={lead.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/app/leads/${lead.id}`}
                      className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {vehicle
                        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
                        : lead.vehicleLabel
                          ? `${lead.vehicleLabel} (no longer in inventory)`
                          : "General interest (no specific vehicle)"}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {lead.source && `${lead.source} · `}
                      Created {formatLeadDate(lead.createdAt)}
                    </p>
                    {lead.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">{lead.notes}</p>
                    )}
                  </div>
                  <LeadStatusBadge status={lead.status} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export { CustomerLeadsList };

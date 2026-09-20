import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Customer } from "@/features/customers/domain/customer";
import type { Vehicle } from "@/features/inventory/data/types";
import type { Lead } from "@/features/leads/domain/lead";
import { LeadStatusBadge } from "@/features/leads/components/lead-status-badge";

function formatLeadDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type RecentLeadsProps = {
  leads: Lead[];
  customersById: Map<string, Customer>;
  vehiclesById: Map<string, Vehicle>;
};

function RecentLeads({ leads, customersById, vehiclesById }: RecentLeadsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent leads</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {leads.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No leads recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {leads.map((lead) => {
              const customer = customersById.get(lead.customerId);
              const vehicle = lead.vehicleId ? vehiclesById.get(lead.vehicleId) : undefined;
              return (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    {customer ? (
                      <Link
                        href={`/app/customers/${customer.id}`}
                        className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {customer.name}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unknown customer</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {vehicle
                        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
                        : lead.vehicleLabel
                          ? `${lead.vehicleLabel} (no longer in inventory)`
                          : "General interest"}{" "}
                      · {formatLeadDate(lead.createdAt)}
                    </p>
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

export { RecentLeads };

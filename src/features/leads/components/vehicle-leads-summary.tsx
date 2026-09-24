import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Customer } from "@/features/customers/domain/customer";
import type { Lead } from "../domain/lead";
import { LeadStatusBadge } from "./lead-status-badge";
import { AddCustomerInterestDialog } from "./add-customer-interest-dialog";

const ACTIVE_STATUSES = new Set(["new", "contacted", "qualified"]);

function formatLeadDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type VehicleLeadsSummaryProps = {
  vehicleId: string;
  leads: Lead[];
  customersById: Map<string, Customer>;
};

function VehicleLeadsSummary({ vehicleId, leads, customersById }: VehicleLeadsSummaryProps) {
  const activeCount = leads.filter((lead) => ACTIVE_STATUSES.has(lead.status)).length;
  const recentLeads = leads.slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Customer interest</CardTitle>
        <AddCustomerInterestDialog vehicleId={vehicleId} />
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground">
          {leads.length === 0 ? (
            "No customer interest recorded yet."
          ) : (
            <>
              <span className="font-medium text-foreground">{activeCount}</span> active
              lead{activeCount === 1 ? "" : "s"} · {leads.length} total
            </>
          )}
        </p>

        {recentLeads.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {recentLeads.map((lead) => {
              const customer = customersById.get(lead.customerId);
              return (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-2">
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
                      {formatLeadDate(lead.createdAt)}
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

export { VehicleLeadsSummary };

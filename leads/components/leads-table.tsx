import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

import type { Customer } from "@/features/customers/domain/customer";
import type { Vehicle } from "@/features/inventory/data/types";
import type { Lead } from "../domain/lead";
import { LeadStatusSelect } from "./lead-status-select";

function formatLeadDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Compares by calendar date only (nextFollowUpAt is a plain date, not a timestamp), so "today" never reads as overdue. */
function isFollowUpOverdue(nextFollowUpAt: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return nextFollowUpAt.slice(0, 10) < today;
}

type LeadsTableProps = {
  leads: Lead[];
  customersById: Map<string, Customer>;
  vehiclesById: Map<string, Vehicle>;
};

function LeadsTable({ leads, customersById, vehiclesById }: LeadsTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-2/50 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5">Customer</th>
            <th className="px-4 py-2.5">Vehicle</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Follow-up</th>
            <th className="px-4 py-2.5">Source</th>
            <th className="px-4 py-2.5">Created</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {leads.map((lead) => {
            const customer = customersById.get(lead.customerId);
            const vehicle = lead.vehicleId ? vehiclesById.get(lead.vehicleId) : undefined;
            const overdue = lead.nextFollowUpAt ? isFollowUpOverdue(lead.nextFollowUpAt) : false;

            return (
              <tr key={lead.id} className="transition-colors hover:bg-surface-2/40">
                <td className="px-4 py-2.5">
                  {customer ? (
                    <Link
                      href={`/app/customers/${customer.id}`}
                      className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {customer.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unknown customer</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {vehicle ? (
                    <Link
                      href={`/app/inventory/${vehicle.id}`}
                      className="text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </Link>
                  ) : lead.vehicleLabel ? (
                    <span className="text-muted-foreground">
                      {lead.vehicleLabel} <span className="italic">(no longer in inventory)</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No current vehicle</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <LeadStatusSelect leadId={lead.id} status={lead.status} />
                </td>
                <td className="px-4 py-2.5">
                  {lead.nextFollowUpAt ? (
                    <span
                      className={`inline-flex items-center gap-1 text-xs ${
                        overdue ? "font-medium text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {overdue && <AlertTriangle className="h-3 w-3" />}
                      {formatLeadDate(lead.nextFollowUpAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-subtle-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{lead.source || "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {formatLeadDate(lead.createdAt)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/app/leads/${lead.id}`}
                    aria-label="View lead"
                    className="inline-flex text-subtle-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { LeadsTable };

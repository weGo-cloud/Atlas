import Link from "next/link";

import { Table } from "@/components/ui/table";
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
    <Table className="min-w-[52rem]">
        <thead className="border-b border-border bg-surface-2">
          <tr>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Customer</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Vehicle</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Follow-up</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Source</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Created</th>
            <th scope="col" className="relative px-4 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {leads.map((lead) => {
            const customer = customersById.get(lead.customerId);
            const vehicle = lead.vehicleId ? vehiclesById.get(lead.vehicleId) : undefined;
            const overdue = lead.nextFollowUpAt ? isFollowUpOverdue(lead.nextFollowUpAt) : false;

            return (
              <tr key={lead.id} className="transition-colors hover:bg-surface-2/70">
                <td className="px-4 py-2.5 min-w-[10rem] max-w-[16rem]">
                  {customer ? (
                    <Link
                      href={`/app/customers/${customer.id}`}
                      className="font-medium text-foreground rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {customer.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unknown customer</span>
                  )}
                </td>
                <td className="px-4 py-2.5 min-w-[9rem] max-w-[14rem] [&_a]:line-clamp-3 [&_a]:block">
                  {vehicle ? (
                    <Link
                      href={`/app/inventory/${vehicle.id}`}
                      className="text-foreground rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
      </Table>
  );
}

export { LeadsTable };

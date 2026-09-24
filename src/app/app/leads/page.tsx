import { getCustomerService } from "@/features/customers/service";
import { CreateLeadDialog } from "@/features/leads/components/create-lead-dialog";
import { LeadsEmptyState } from "@/features/leads/components/leads-empty-state";
import { LeadsPagination } from "@/features/leads/components/leads-pagination";
import { LeadsTable } from "@/features/leads/components/leads-table";
import { LeadsToolbar } from "@/features/leads/components/leads-toolbar";
import { parseLeadSearchParams, type LeadSearchParams } from "@/features/leads/lib/leads-query-params";
import { getLeadService } from "@/features/leads/service";
import { getVehicleService } from "@/features/inventory/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Leads · Atlas" };

type LeadsPageProps = {
  searchParams: Promise<LeadSearchParams>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const { business } = await requireCurrentSession();
  const leadService = getLeadService(business.id);
  const customerService = getCustomerService(business.id);
  const vehicleService = getVehicleService(business.id);

  const resolvedSearchParams = await searchParams;
  const query = parseLeadSearchParams(resolvedSearchParams);

  const { items: leads, page, pageSize, total, totalPages } = await leadService.listLeadsPaged(query);

  // Batched lookups — one query each for every customer/vehicle
  // referenced by this page's leads, instead of a query per row.
  const customerIds = Array.from(new Set(leads.map((lead) => lead.customerId)));
  const vehicleIds = Array.from(
    new Set(leads.map((lead) => lead.vehicleId).filter((id): id is string => Boolean(id)))
  );
  const [customers, vehicles] = await Promise.all([
    customerService.getCustomersByIds(customerIds),
    vehicleService.getVehiclesByIds(vehicleIds),
  ]);
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));

  const isFiltered = Boolean(query.status) || Boolean(query.followUpDueBy);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every customer interest, from first contact to a decision.
          </p>
        </div>
        <CreateLeadDialog />
      </div>

      <LeadsToolbar activeStatus={query.status} followUpOnly={Boolean(query.followUpDueBy)} />

      {leads.length === 0 ? (
        <LeadsEmptyState filtered={isFiltered} />
      ) : (
        <>
          <LeadsTable leads={leads} customersById={customersById} vehiclesById={vehiclesById} />
          <LeadsPagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} query={query} />
        </>
      )}
    </div>
  );
}

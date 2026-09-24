import { getCustomerService } from "@/features/customers/service";
import { DealsEmptyState } from "@/features/deals/components/deals-empty-state";
import { DealsPagination } from "@/features/deals/components/deals-pagination";
import { DealsTable } from "@/features/deals/components/deals-table";
import { DealsToolbar } from "@/features/deals/components/deals-toolbar";
import { parseDealSearchParams, type DealSearchParams } from "@/features/deals/lib/deals-query-params";
import { getDealService } from "@/features/deals/service";
import { getVehicleService } from "@/features/inventory/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Deals · Atlas" };

type DealsPageProps = {
  searchParams: Promise<DealSearchParams>;
};

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const { business } = await requireCurrentSession();
  const dealService = getDealService(business.id);
  const customerService = getCustomerService(business.id);
  const vehicleService = getVehicleService(business.id);

  const resolvedSearchParams = await searchParams;
  const query = parseDealSearchParams(resolvedSearchParams);

  const { items: deals, page, pageSize, total, totalPages } = await dealService.listDealsPaged(query);

  // Batched lookups — one query each for every customer/vehicle
  // referenced by this page's deals, instead of a query per row.
  const customerIds = Array.from(new Set(deals.map((deal) => deal.customerId)));
  const vehicleIds = Array.from(
    new Set(deals.map((deal) => deal.vehicleId).filter((id): id is string => Boolean(id)))
  );
  const [customers, vehicles] = await Promise.all([
    customerService.getCustomersByIds(customerIds),
    vehicleService.getVehiclesByIds(vehicleIds),
  ]);
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));

  const isFiltered = Boolean(query.status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every commercial transaction in progress, from first negotiation to close.
        </p>
      </div>

      <DealsToolbar activeStatus={query.status} />

      {deals.length === 0 ? (
        <DealsEmptyState filtered={isFiltered} />
      ) : (
        <>
          <DealsTable deals={deals} customersById={customersById} vehiclesById={vehiclesById} />
          <DealsPagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} query={query} />
        </>
      )}
    </div>
  );
}

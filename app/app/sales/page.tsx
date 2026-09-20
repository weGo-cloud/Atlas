import { getCustomerService } from "@/features/customers/service";
import { SalesEmptyState } from "@/features/sales/components/sales-empty-state";
import { SalesPagination } from "@/features/sales/components/sales-pagination";
import { SalesTable } from "@/features/sales/components/sales-table";
import { parseSaleSearchParams, type SaleSearchParams } from "@/features/sales/lib/sales-query-params";
import { getSaleService } from "@/features/sales/service";
import { getVehicleService } from "@/features/inventory/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Sales · Atlas" };

type SalesPageProps = {
  searchParams: Promise<SaleSearchParams>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const { business } = await requireCurrentSession();
  const saleService = getSaleService(business.id);
  const customerService = getCustomerService(business.id);
  const vehicleService = getVehicleService(business.id);

  const resolvedSearchParams = await searchParams;
  const query = parseSaleSearchParams(resolvedSearchParams);

  const { items: sales, page, pageSize, total, totalPages } = await saleService.listSalesPaged(query);

  // Batched lookups — one query each for every customer/vehicle
  // referenced by this page's sales, instead of a query per row.
  const customerIds = Array.from(new Set(sales.map((sale) => sale.customerId)));
  const vehicleIds = Array.from(
    new Set(sales.map((sale) => sale.vehicleId).filter((id): id is string => Boolean(id)))
  );
  const [customers, vehicles] = await Promise.all([
    customerService.getCustomersByIds(customerIds),
    vehicleService.getVehiclesByIds(vehicleIds),
  ]);
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The permanent record of every finalized transaction.
        </p>
      </div>

      {sales.length === 0 ? (
        <SalesEmptyState />
      ) : (
        <>
          <SalesTable sales={sales} customersById={customersById} vehiclesById={vehiclesById} />
          <SalesPagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} query={query} />
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActivityService } from "@/features/activities/service";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { getCustomerService } from "@/features/customers/service";
import { getDealService } from "@/features/deals/service";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import { getVehicleService } from "@/features/inventory/service";
import { SaleBadge } from "@/features/sales/components/sale-badge";
import { getSaleService } from "@/features/sales/service";
import { getBusinessUsersByIds } from "@/features/auth/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Sale · Atlas" };

type SaleDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const { business } = await requireCurrentSession();
  const saleService = getSaleService(business.id);
  const customerService = getCustomerService(business.id);
  const vehicleService = getVehicleService(business.id);
  const dealService = getDealService(business.id);
  const activityService = getActivityService(business.id);

  const { id } = await params;

  const saleResult = await saleService.getSale(id);
  if (!saleResult.ok) notFound();
  const sale = saleResult.data;

  const [customerResult, vehicleResult, dealResult] = await Promise.all([
    customerService.getCustomer(sale.customerId),
    sale.vehicleId ? vehicleService.getVehicle(sale.vehicleId) : Promise.resolve(null),
    dealService.getDeal(sale.dealId),
  ]);
  const customer = customerResult.ok ? customerResult.data : null;
  const vehicle = vehicleResult?.ok ? vehicleResult.data : null;
  const deal = dealResult.ok ? dealResult.data : null;

  // A sale's activity is recorded against its originating deal's
  // lead (see sale-actions.ts) — showing that lead's full timeline
  // here is exactly the history relevant to this sale.
  const activitiesPage = deal
    ? await activityService.getActivitiesForLead(deal.leadId, { page: 1, pageSize: 50 })
    : { items: [] };
  const actorIds = Array.from(new Set(activitiesPage.items.map((a) => a.userId)));
  const actors = await getBusinessUsersByIds(business.id, actorIds);
  const usersById = new Map(actors.map((u) => [u.id, u]));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/app/sales"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Sales
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {vehicle
              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
              : sale.vehicleLabel
                ? `${sale.vehicleLabel} (no longer in inventory)`
                : "Sale"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer ? customer.name : "Unknown customer"} · {formatPriceKsh(sale.saleAmount)} · Sold{" "}
            {formatDateTime(sale.soldAt)}
          </p>
        </div>
        <SaleBadge />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {customer ? (
              <>
                <Link
                  href={`/app/customers/${customer.id}`}
                  className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {customer.name}
                </Link>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {customer.phone ?? "Not provided"}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {customer.email ?? "Not provided"}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">This customer record no longer exists.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deal</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {deal ? (
              <>
                <Link
                  href={`/app/deals/${deal.id}`}
                  className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  View originating deal
                </Link>
                <p className="text-sm text-muted-foreground">Agreed price: {formatPriceKsh(deal.agreedPrice)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">This deal record no longer exists.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {vehicle ? (
              <>
                <Link
                  href={`/app/inventory/${vehicle.id}`}
                  className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </Link>
                <p className="text-sm text-muted-foreground">Stock #{vehicle.stockId}</p>
                <p className="text-sm text-muted-foreground">Current listing: {formatPriceKsh(vehicle.price)}</p>
              </>
            ) : sale.vehicleLabel ? (
              <p className="text-sm text-muted-foreground">
                <span className="italic">Was:</span> {sale.vehicleLabel}. This listing is no longer in inventory.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No vehicle on record.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          <p className="text-sm text-foreground">Final sale amount: {formatPriceKsh(sale.saleAmount)}</p>
          <p className="text-sm text-muted-foreground">Sold: {formatDateTime(sale.soldAt)}</p>
          {sale.notes && <p className="text-sm text-muted-foreground">Notes: {sale.notes}</p>}
          <p className="text-xs text-muted-foreground">
            This is a permanent, historical record — it can&apos;t be edited.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ActivityTimeline activities={activitiesPage.items} usersById={usersById} />
        </CardContent>
      </Card>
    </div>
  );
}

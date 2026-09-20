import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActivityService } from "@/features/activities/service";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { getCustomerService } from "@/features/customers/service";
import { DealDetailEditForm } from "@/features/deals/components/deal-detail-edit-form";
import { DealStatusBadge } from "@/features/deals/components/deal-status-badge";
import { DealStatusSelect } from "@/features/deals/components/deal-status-select";
import { getDealService } from "@/features/deals/service";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import { getVehicleService } from "@/features/inventory/service";
import { getLeadService } from "@/features/leads/service";
import { DealSaleSummary } from "@/features/sales/components/deal-sale-summary";
import { getSaleService } from "@/features/sales/service";
import { getBusinessUsersByIds } from "@/features/auth/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Deal · Atlas" };

type DealDetailPageProps = {
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

export default async function DealDetailPage({ params }: DealDetailPageProps) {
  const { business, user } = await requireCurrentSession();
  const dealService = getDealService(business.id);
  const customerService = getCustomerService(business.id);
  const vehicleService = getVehicleService(business.id);
  const leadService = getLeadService(business.id);
  const activityService = getActivityService(business.id);
  const saleService = getSaleService(business.id);

  const { id } = await params;

  const dealResult = await dealService.getDeal(id);
  if (!dealResult.ok) notFound();
  const deal = dealResult.data;

  const [customerResult, vehicleResult, leadResult, activitiesPage, sale] = await Promise.all([
    customerService.getCustomer(deal.customerId),
    deal.vehicleId ? vehicleService.getVehicle(deal.vehicleId) : Promise.resolve(null),
    leadService.getLead(deal.leadId),
    // A deal's activities are recorded against its lead (see
    // deal-actions.ts) — filtering the lead's timeline by this deal's
    // id in metadata isn't needed since a lead's full history is
    // exactly what's relevant here (its Deal is part of that story).
    activityService.getActivitiesForLead(deal.leadId, { page: 1, pageSize: 50 }),
    saleService.getSaleForDeal(deal.id),
  ]);
  const customer = customerResult.ok ? customerResult.data : null;
  const vehicle = vehicleResult?.ok ? vehicleResult.data : null;
  const lead = leadResult.ok ? leadResult.data : null;

  const actorIds = Array.from(new Set(activitiesPage.items.map((a) => a.userId)));
  const actors = await getBusinessUsersByIds(business.id, actorIds);
  const usersById = new Map(actors.map((u) => [u.id, u]));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/app/deals"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Deals
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {vehicle
              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
              : deal.vehicleLabel
                ? `${deal.vehicleLabel} (no longer in inventory)`
                : "Deal"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer ? customer.name : "Unknown customer"} · {formatPriceKsh(deal.agreedPrice)} · Created{" "}
            {formatDateTime(deal.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DealStatusBadge status={deal.status} />
          <DealStatusSelect dealId={deal.id} status={deal.status} />
        </div>
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
            <CardTitle>Lead</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {lead ? (
              <>
                <Link
                  href={`/app/leads/${lead.id}`}
                  className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  View originating lead
                </Link>
                <p className="text-sm text-muted-foreground">Lead status: {lead.status}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">This lead record no longer exists.</p>
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
                <p className="text-sm text-muted-foreground">Listing price: {formatPriceKsh(vehicle.price)}</p>
              </>
            ) : deal.vehicleLabel ? (
              <p className="text-sm text-muted-foreground">
                <span className="italic">Was:</span> {deal.vehicleLabel}. This listing is no longer in inventory.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No vehicle on record.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commercial details</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <DealDetailEditForm deal={deal} />
        </CardContent>
      </Card>

      <DealSaleSummary
        dealId={deal.id}
        dealStatus={deal.status}
        dealAgreedPrice={deal.agreedPrice}
        sale={sale}
        canCreateSale={user.role === "owner"}
      />

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

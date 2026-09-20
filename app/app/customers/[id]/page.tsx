import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Pencil, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { ManualActivityForm } from "@/features/activities/components/manual-activity-form";
import { getActivityService } from "@/features/activities/service";
import { CustomerLeadSummary } from "@/features/customers/components/customer-lead-summary";
import { CustomerLeadsList } from "@/features/customers/components/customer-leads-list";
import { CustomerVehiclesOfInterest } from "@/features/customers/components/customer-vehicles-of-interest";
import { getCustomerService } from "@/features/customers/service";
import { CustomerDealsList } from "@/features/deals/components/customer-deals-list";
import { getDealService } from "@/features/deals/service";
import { getVehicleService } from "@/features/inventory/service";
import { getLeadService } from "@/features/leads/service";
import { CustomerSalesList } from "@/features/sales/components/customer-sales-list";
import { getSaleService } from "@/features/sales/service";
import { getBusinessUsersByIds } from "@/features/auth/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { business } = await requireCurrentSession();
  const customerService = getCustomerService(business.id);
  const vehicleService = getVehicleService(business.id);
  const leadService = getLeadService(business.id);
  const activityService = getActivityService(business.id);
  const dealService = getDealService(business.id);
  const saleService = getSaleService(business.id);

  const { id } = await params;

  const result = await customerService.getCustomer(id);
  if (!result.ok) notFound();
  const customer = result.data;

  const [leads, deals, sales] = await Promise.all([
    leadService.getLeadsForCustomer(id),
    dealService.getDealsForCustomer(id),
    saleService.getSalesForCustomer(id),
  ]);

  // Batched lookup — one query for every vehicle referenced by this
  // customer's leads or deals, instead of one query per row.
  const vehicleIds = Array.from(
    new Set(
      [...leads.map((lead) => lead.vehicleId), ...deals.map((deal) => deal.vehicleId)].filter(
        (v): v is string => Boolean(v)
      )
    )
  );
  const vehicles = await vehicleService.getVehiclesByIds(vehicleIds);
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  // A single WHERE customer_id = ? query returns both customer-level
  // and every lead-level activity — see schema.ts's comment on why
  // customerId is always set, even on lead-scoped activities.
  const activitiesPage = await activityService.getActivitiesForCustomer(id, { page: 1, pageSize: 50 });
  const actorIds = Array.from(new Set(activitiesPage.items.map((a) => a.userId)));
  const actors = await getBusinessUsersByIds(business.id, actorIds);
  const usersById = new Map(actors.map((u) => [u.id, u]));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/app/customers"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {customer.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer since{" "}
            {new Date(customer.createdAt).toLocaleDateString("en-KE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <Button asChild variant="outline" className="gap-1.5 self-start">
          <Link href={`/app/customers/${customer.id}/edit`}>
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-subtle-foreground" />
            <span className="text-foreground">{customer.phone ?? "Not provided"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-subtle-foreground" />
            <span className="text-foreground">{customer.email ?? "Not provided"}</span>
          </div>
          {customer.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="mt-1 text-sm text-foreground">{customer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <CustomerLeadSummary leads={leads} />

      <CustomerVehiclesOfInterest leads={leads} vehiclesById={vehiclesById} />

      <CustomerLeadsList
        customerId={customer.id}
        customerName={customer.name}
        leads={leads}
        vehiclesById={vehiclesById}
      />

      <CustomerDealsList deals={deals} vehiclesById={vehiclesById} />

      <CustomerSalesList sales={sales} />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <ManualActivityForm customerId={customer.id} />
          <ActivityTimeline activities={activitiesPage.items} usersById={usersById} showLeadContext />
        </CardContent>
      </Card>
    </div>
  );
}

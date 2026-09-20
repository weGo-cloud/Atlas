import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Mail, Phone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActivityService } from "@/features/activities/service";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { ManualActivityForm } from "@/features/activities/components/manual-activity-form";
import { getCustomerService } from "@/features/customers/service";
import { LeadDealSummary } from "@/features/deals/components/lead-deal-summary";
import { getDealService } from "@/features/deals/service";
import { getVehicleService } from "@/features/inventory/service";
import { CompleteFollowUpButton } from "@/features/leads/components/complete-follow-up-button";
import { LeadDetailEditForm } from "@/features/leads/components/lead-detail-edit-form";
import { LeadStatusBadge } from "@/features/leads/components/lead-status-badge";
import { LeadStatusSelect } from "@/features/leads/components/lead-status-select";
import { getLeadService } from "@/features/leads/service";
import { getBusinessUsersByIds } from "@/features/auth/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Lead · Atlas" };

type LeadDetailPageProps = {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { business } = await requireCurrentSession();
  const leadService = getLeadService(business.id);
  const customerService = getCustomerService(business.id);
  const vehicleService = getVehicleService(business.id);
  const activityService = getActivityService(business.id);
  const dealService = getDealService(business.id);

  const { id } = await params;

  const leadResult = await leadService.getLead(id);
  if (!leadResult.ok) notFound();
  const lead = leadResult.data;

  const [customerResult, vehicleResult, activitiesPage, leadDeals] = await Promise.all([
    customerService.getCustomer(lead.customerId),
    lead.vehicleId ? vehicleService.getVehicle(lead.vehicleId) : Promise.resolve(null),
    activityService.getActivitiesForLead(lead.id, { page: 1, pageSize: 50 }),
    dealService.getDealsForLead(lead.id),
  ]);
  const customer = customerResult.ok ? customerResult.data : null;
  const vehicle = vehicleResult?.ok ? vehicleResult.data : null;
  const activeDeal = leadDeals.find((deal) => deal.status !== "completed" && deal.status !== "cancelled") ?? null;

  const actorIds = Array.from(new Set(activitiesPage.items.map((a) => a.userId)));
  const actors = await getBusinessUsersByIds(business.id, actorIds);
  const usersById = new Map(actors.map((u) => [u.id, u]));

  const today = new Date().toISOString().slice(0, 10);
  const followUpOverdue = Boolean(lead.nextFollowUpAt && lead.nextFollowUpAt.slice(0, 10) < today);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/app/leads"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Leads
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {vehicle
              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
              : lead.vehicleLabel
                ? `${lead.vehicleLabel} (no longer in inventory)`
                : "General interest"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer ? customer.name : "Unknown customer"} · Created {formatDateTime(lead.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LeadStatusBadge status={lead.status} />
          <LeadStatusSelect leadId={lead.id} status={lead.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              <p className="text-sm text-muted-foreground">
                This customer record no longer exists.
              </p>
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
              </>
            ) : lead.vehicleLabel ? (
              <p className="text-sm text-muted-foreground">
                <span className="italic">Previously interested in:</span> {lead.vehicleLabel}.
                This listing is no longer in inventory.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not yet tied to a specific vehicle.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <LeadDealSummary
        leadId={lead.id}
        activeDeal={activeDeal}
        allDeals={leadDeals}
        leadVehicle={vehicle ? { id: vehicle.id, label: `${vehicle.year} ${vehicle.make} ${vehicle.model}` } : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>Lead details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Source</p>
              <p className="mt-0.5 text-foreground">{lead.source || "Not specified"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Last contacted</p>
              <p className="mt-0.5 text-foreground">
                {lead.lastContactedAt ? formatDateTime(lead.lastContactedAt) : "Never"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Last updated</p>
              <p className="mt-0.5 text-foreground">{formatDateTime(lead.updatedAt)}</p>
            </div>
          </div>

          {lead.nextFollowUpAt && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
              <div className="flex items-center gap-2">
                {followUpOverdue && <AlertTriangle className="h-4 w-4 text-destructive" />}
                <p className="text-sm">
                  <span className="text-muted-foreground">
                    {followUpOverdue ? "Follow-up overdue: " : "Follow-up scheduled: "}
                  </span>
                  <span className={followUpOverdue ? "font-medium text-destructive" : "font-medium text-foreground"}>
                    {formatDate(lead.nextFollowUpAt)}
                  </span>
                </p>
              </div>
              <CompleteFollowUpButton leadId={lead.id} />
            </div>
          )}

          <LeadDetailEditForm lead={lead} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <ManualActivityForm customerId={lead.customerId} leadId={lead.id} />
          <ActivityTimeline activities={activitiesPage.items} usersById={usersById} />
        </CardContent>
      </Card>
    </div>
  );
}

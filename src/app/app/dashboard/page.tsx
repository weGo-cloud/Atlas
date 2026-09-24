import Link from "next/link";
import { CheckCircle2, Plus, TrendingUp, UserPlus, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatPriceKsh } from "@/features/inventory/lib/format";
import { getCustomerService } from "@/features/customers/service";
import { getVehiclePhotoService, getVehicleService } from "@/features/inventory/service";
import { InventoryMakeBreakdown } from "@/features/dashboard/components/inventory-make-breakdown";
import { InventoryStatusOverview } from "@/features/dashboard/components/inventory-status-overview";
import { MostInterestedVehicles } from "@/features/dashboard/components/most-interested-vehicles";
import { RecentInventory } from "@/features/dashboard/components/recent-inventory";
import { RecentLeads } from "@/features/dashboard/components/recent-leads";
import { StatStrip } from "@/features/dashboard/components/stat-strip";
import { getDashboardService } from "@/features/dashboard/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { resolveDateRange } from "@/features/analytics/domain/date-range";
import { getIntelligenceService } from "@/features/intelligence/service";

import { IntelligenceCard } from "./intelligence-card";
import { MetricCard } from "./metric-card";

export default async function DashboardPage() {
  const { business } = await requireCurrentSession();
  const dashboardService = getDashboardService(business.id);
  const customerService = getCustomerService(business.id);
  const vehicleService = getVehicleService(business.id);
  const intelligenceService = getIntelligenceService(business.id);

  const [
    summary,
    statusBreakdown,
    makeBreakdown,
    recentlyAdded,
    customerLeadSummary,
    mostInterestedVehicles,
    recentLeads,
    intelligence,
  ] = await Promise.all([
    dashboardService.getSummary(),
    dashboardService.getStatusBreakdown(),
    dashboardService.getMakeBreakdown(),
    dashboardService.getRecentlyAdded(),
    dashboardService.getCustomerLeadSummary(),
    dashboardService.getMostInterestedVehicles(),
    dashboardService.getRecentLeads(),
    // last30 mirrors Analytics' own default preset — a sensible "recent activity" window for a dashboard teaser.
    intelligenceService.getIntelligence(resolveDateRange("last30")),
  ]);

  // Batched lookups for the recent-leads list — one query each,
  // rather than per-row lookups (Phase 18: avoid N+1).
  const customerIds = Array.from(new Set(recentLeads.map((lead) => lead.customerId)));
  const vehicleIds = Array.from(
    new Set(recentLeads.map((lead) => lead.vehicleId).filter((id): id is string => Boolean(id)))
  );
  const [recentLeadCustomers, recentLeadVehicles] = await Promise.all([
    customerService.getCustomersByIds(customerIds),
    vehicleService.getVehiclesByIds(vehicleIds),
  ]);
  const customersById = new Map(recentLeadCustomers.map((c) => [c.id, c]));
  const vehiclesById = new Map(recentLeadVehicles.map((v) => [v.id, v]));

  // One batched lookup for the featured-inventory cards' primary photos —
  // the same call the Inventory page makes for its own page of vehicles.
  const recentPhotos = await getVehiclePhotoService(business.id).listPrimaryForVehicles(
    recentlyAdded.map((vehicle) => vehicle.id)
  );
  const primaryPhotoUrlByVehicleId: Record<string, string> = {};
  for (const [vehicleId, photo] of recentPhotos) {
    primaryPhotoUrlByVehicleId[vehicleId] = photo.url;
  }

  const conversionLabel =
    customerLeadSummary.conversionRate === null
      ? "—"
      : `${Math.round(customerLeadSummary.conversionRate * 100)}%`;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      {/* Level 1 — dealership context */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Good morning.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening at {business.name} today.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/app/inventory">View inventory</Link>
          </Button>
          <Button asChild className="gap-1.5">
            <Link href="/app/inventory/new">
              <Plus className="h-4 w-4" />
              Add vehicle
            </Link>
          </Button>
        </div>
      </header>

      {/* Level 2 — the numbers to read first, then the supporting figures */}
      <section aria-label="Key metrics" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            emphasis="hero"
            label="Available vehicles"
            value={String(summary.availableVehicles)}
            hint={`of ${summary.totalVehicles} in inventory`}
            icon={CheckCircle2}
          />
          <MetricCard
            emphasis="hero"
            label="Inventory value"
            value={formatPriceKsh(summary.totalInventoryValue)}
            icon={Wallet}
          />
          <MetricCard
            emphasis="hero"
            label="New leads"
            value={String(customerLeadSummary.newLeads)}
            icon={UserPlus}
          />
          <MetricCard
            emphasis="hero"
            label="Conversion rate"
            value={conversionLabel}
            icon={TrendingUp}
          />
        </div>

        <StatStrip
          items={[
            { label: "Total vehicles", value: String(summary.totalVehicles) },
            { label: "Reserved", value: String(summary.reservedVehicles) },
            { label: "Sold", value: String(summary.soldVehicles) },
            { label: "Average price", value: formatPriceKsh(summary.averageVehiclePrice) },
            { label: "Total customers", value: String(customerLeadSummary.totalCustomers) },
            { label: "Active leads", value: String(customerLeadSummary.activeLeads) },
            { label: "Closed leads", value: String(customerLeadSummary.closedLeads) },
          ]}
        />
      </section>

      {/* Level 3 — operational intelligence */}
      <section aria-label="Operational intelligence" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <IntelligenceCard signals={intelligence.signals} className="lg:col-span-2" />
        <InventoryStatusOverview items={statusBreakdown} />
      </section>

      {/* Level 4 — detail */}
      <RecentInventory vehicles={recentlyAdded} primaryPhotoUrlByVehicleId={primaryPhotoUrlByVehicleId} />

      <section aria-label="Pipeline and composition" className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RecentLeads leads={recentLeads} customersById={customersById} vehiclesById={vehiclesById} />
        <MostInterestedVehicles items={mostInterestedVehicles} />
        <InventoryMakeBreakdown items={makeBreakdown} />
      </section>
    </div>
  );
}

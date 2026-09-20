import { CheckCircle2, Clock3, DollarSign, Package, TrendingUp, UserPlus, Users, Wallet } from "lucide-react";

import { formatPriceKsh } from "@/features/inventory/lib/format";
import { getCustomerService } from "@/features/customers/service";
import { getVehicleService } from "@/features/inventory/service";
import { InventoryMakeBreakdown } from "@/features/dashboard/components/inventory-make-breakdown";
import { InventoryStatusOverview } from "@/features/dashboard/components/inventory-status-overview";
import { MostInterestedVehicles } from "@/features/dashboard/components/most-interested-vehicles";
import { RecentInventory } from "@/features/dashboard/components/recent-inventory";
import { RecentLeads } from "@/features/dashboard/components/recent-leads";
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

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Good morning.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your inventory today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Total Vehicles"
          value={String(summary.totalVehicles)}
          icon={Package}
        />
        <MetricCard
          label="Available"
          value={String(summary.availableVehicles)}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Reserved"
          value={String(summary.reservedVehicles)}
          icon={Clock3}
        />
        <MetricCard
          label="Sold"
          value={String(summary.soldVehicles)}
          icon={TrendingUp}
        />
        <MetricCard
          label="Inventory Value"
          value={formatPriceKsh(summary.totalInventoryValue)}
          icon={Wallet}
        />
        <MetricCard
          label="Average Price"
          value={formatPriceKsh(summary.averageVehiclePrice)}
          icon={DollarSign}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Total Customers"
          value={String(customerLeadSummary.totalCustomers)}
          icon={Users}
        />
        <MetricCard
          label="New Leads"
          value={String(customerLeadSummary.newLeads)}
          icon={UserPlus}
        />
        <MetricCard
          label="Active Leads"
          value={String(customerLeadSummary.activeLeads)}
          icon={Clock3}
        />
        <MetricCard
          label="Closed Leads"
          value={String(customerLeadSummary.closedLeads)}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Conversion Rate"
          value={
            customerLeadSummary.conversionRate === null
              ? "—"
              : `${Math.round(customerLeadSummary.conversionRate * 100)}%`
          }
          icon={TrendingUp}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InventoryStatusOverview items={statusBreakdown} />
        <InventoryMakeBreakdown items={makeBreakdown} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MostInterestedVehicles items={mostInterestedVehicles} />
        <RecentLeads leads={recentLeads} customersById={customersById} vehiclesById={vehiclesById} />
      </div>

      <div className="mt-6">
        <IntelligenceCard signals={intelligence.signals} />
      </div>

      <div className="mt-6">
        <RecentInventory vehicles={recentlyAdded} />
      </div>
    </>
  );
}

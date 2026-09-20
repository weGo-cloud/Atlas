import { Car, DollarSign, Handshake, TrendingUp, Users, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import { VEHICLE_STATUS_LABEL } from "@/features/inventory/data/types";
import { LEAD_STATUS_LABEL } from "@/features/leads/domain/lead";
import { DEAL_STATUS_LABEL } from "@/features/deals/domain/deal";

import { AnalyticsMetricCard } from "@/features/analytics/components/analytics-metric-card";
import { DateRangeSelect } from "@/features/analytics/components/date-range-select";
import { FunnelCard } from "@/features/analytics/components/funnel-card";
import { OperationsCard } from "@/features/analytics/components/operations-card";
import { SalesTrendChart } from "@/features/analytics/components/sales-trend-chart";
import { StatusBreakdownCard, type StatusSegment } from "@/features/analytics/components/status-breakdown-card";
import { resolveDateRange } from "@/features/analytics/domain/date-range";
import { formatRate } from "@/features/analytics/lib/format";
import {
  parseAnalyticsSearchParams,
  type AnalyticsSearchParams,
} from "@/features/analytics/lib/analytics-query-params";
import { getAnalyticsService } from "@/features/analytics/service";

export const metadata = { title: "Analytics · Atlas" };

const VEHICLE_SEGMENT_CLASS: Record<string, string> = {
  available: "bg-success",
  reserved: "bg-warning",
  sold: "bg-subtle-foreground",
};

const LEAD_SEGMENT_CLASS: Record<string, string> = {
  new: "bg-info",
  contacted: "bg-primary",
  qualified: "bg-warning",
  negotiating: "bg-warning",
  won: "bg-success",
  lost: "bg-destructive",
};

const DEAL_SEGMENT_CLASS: Record<string, string> = {
  draft: "bg-subtle-foreground",
  negotiating: "bg-warning",
  reserved: "bg-info",
  completed: "bg-success",
  cancelled: "bg-destructive",
};

type AnalyticsPageProps = {
  searchParams: Promise<AnalyticsSearchParams>;
};

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const { business } = await requireCurrentSession();
  const analyticsService = getAnalyticsService(business.id);

  const resolvedSearchParams = await searchParams;
  const query = parseAnalyticsSearchParams(resolvedSearchParams);
  const range = resolveDateRange(query.preset, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  const overview = await analyticsService.getOverview(range);

  const vehicleSegments: StatusSegment[] = Object.entries(overview.inventory.vehiclesByStatus).map(
    ([status, count]) => ({
      key: status,
      label: VEHICLE_STATUS_LABEL[status as keyof typeof VEHICLE_STATUS_LABEL],
      count,
      colorClass: VEHICLE_SEGMENT_CLASS[status] ?? "bg-subtle-foreground",
    })
  );

  const leadSegments: StatusSegment[] = Object.entries(overview.crm.leadsByStatus).map(([status, count]) => ({
    key: status,
    label: LEAD_STATUS_LABEL[status as keyof typeof LEAD_STATUS_LABEL],
    count,
    colorClass: LEAD_SEGMENT_CLASS[status] ?? "bg-subtle-foreground",
  }));

  const dealSegments: StatusSegment[] = Object.entries(overview.deals.dealsByStatus).map(([status, count]) => ({
    key: status,
    label: DEAL_STATUS_LABEL[status as keyof typeof DEAL_STATUS_LABEL],
    count,
    colorClass: DEAL_SEGMENT_CLASS[status] ?? "bg-subtle-foreground",
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Performance across inventory, CRM, deals, and sales for the selected period."
        actions={<DateRangeSelect preset={query.preset} />}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <AnalyticsMetricCard label="Total customers" value={String(overview.crm.totalCustomers)} icon={Users} />
        <AnalyticsMetricCard
          label="Leads in period"
          value={String(overview.crm.totalLeads)}
          sublabel={`${overview.crm.activeLeads} active`}
          icon={Handshake}
        />
        <AnalyticsMetricCard
          label="Pipeline value"
          value={formatPriceKsh(overview.deals.pipelineValue)}
          sublabel={`${overview.deals.activeDeals} active deals`}
          icon={Wallet}
        />
        <AnalyticsMetricCard
          label="Gross sales value"
          value={formatPriceKsh(overview.sales.grossSalesValue)}
          sublabel={`${overview.sales.totalSales} sales · avg ${
            overview.sales.averageSaleValue !== null ? formatPriceKsh(overview.sales.averageSaleValue) : "N/A"
          }`}
          icon={DollarSign}
        />
        <AnalyticsMetricCard
          label="Current inventory value"
          value={formatPriceKsh(overview.inventory.currentInventoryValue)}
          sublabel={`${overview.inventory.availableVehicles} available`}
          icon={Car}
        />
        <AnalyticsMetricCard
          label="Lead → Sale conversion"
          value={formatRate(overview.funnel.leadToSaleRate)}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SalesTrendChart points={overview.salesTrend} />
        <FunnelCard funnel={overview.funnel} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusBreakdownCard title="Leads by status" segments={leadSegments} emptyLabel="No leads in this period yet." />
        <StatusBreakdownCard title="Deals by status" segments={dealSegments} emptyLabel="No deals in this period yet." />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusBreakdownCard title="Inventory by status" segments={vehicleSegments} emptyLabel="No vehicles in inventory yet." />
        <OperationsCard followUps={overview.followUps} integrity={overview.integrity} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VehicleBusinessActions } from "@/features/inventory/components/vehicle-business-actions";
import { VehicleDescription } from "@/features/inventory/components/vehicle-description";
import { VehicleGallery } from "@/features/inventory/components/vehicle-gallery";
import { VehicleOverview } from "@/features/inventory/components/vehicle-overview";
import { VehicleSpecifications } from "@/features/inventory/components/vehicle-specifications";
import { getVehiclePhotoService, getVehicleService } from "@/features/inventory/service";
import { FurnitureProductDetail, type FurnitureLeadSummary } from "@/features/furniture/components/furniture-product-detail";
import { getFurnitureProductPhotoService, getFurnitureProductService } from "@/features/furniture/service";
import { getCustomerService } from "@/features/customers/service";
import { getDealService } from "@/features/deals/service";
import { VehicleDealSummary } from "@/features/deals/components/vehicle-deal-summary";
import { getLeadService } from "@/features/leads/service";
import { VehicleLeadsSummary } from "@/features/leads/components/vehicle-leads-summary";
import { getSaleService } from "@/features/sales/service";
import { VehicleSaleSummary } from "@/features/sales/components/vehicle-sale-summary";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { hasPermission } from "@/features/auth/domain/permissions";
import { MarketingPanel } from "@/features/marketing/components/marketing-panel";
import { getMarketingPanelData } from "@/features/marketing/service";

type VehicleDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: VehicleDetailPageProps): Promise<Metadata> {
  const { business } = await requireCurrentSession();
  const { id } = await params;

  if (business.vertical === "furniture") {
    const result = await getFurnitureProductService(business.id).getProduct(id);
    return result.ok ? { title: `${result.data.name} · Atlas` } : { title: "Product not found · Atlas" };
  }

  const result = await getVehicleService(business.id).getVehicle(id);
  if (!result.ok) {
    return { title: "Vehicle not found · Atlas" };
  }
  return { title: `${result.data.make} ${result.data.model} · Atlas` };
}

export default async function VehicleDetailPage({
  params,
}: VehicleDetailPageProps) {
  const { user, business } = await requireCurrentSession();
  const { id } = await params;

  if (business.vertical === "furniture") {
    const productService = getFurnitureProductService(business.id);
    const photoService = getFurnitureProductPhotoService(business.id);
    const customerService = getCustomerService(business.id);
    const leadService = getLeadService(business.id);

    const result = await productService.getProduct(id);
    if (!result.ok) notFound();

    const product = result.data;
    const photosResult = await photoService.listPhotos(product.id);
    const photos = photosResult.ok ? photosResult.data : [];

    const productLeads = await leadService.getLeadsForFurnitureProduct(product.id);
    const customerIds = Array.from(new Set(productLeads.map((lead) => lead.customerId)));
    const customers = await customerService.getCustomersByIds(customerIds);
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));

    const leadSummaries: FurnitureLeadSummary[] = productLeads.map((lead) => ({
      id: lead.id,
      customerName: customersById.get(lead.customerId)?.name ?? "Unknown customer",
      status: lead.status,
      createdAt: lead.createdAt,
    }));

    const marketing = await getMarketingPanelData(business.id, { itemType: "furniture_product", itemId: product.id });

    return (
      <FurnitureProductDetail
        product={product}
        photos={photos}
        leads={leadSummaries}
        canDelete={hasPermission(user.role, "furniture_product.delete")}
        marketing={marketing}
      />
    );
  }

  const vehicleService = getVehicleService(business.id);
  const vehiclePhotoService = getVehiclePhotoService(business.id);
  const customerService = getCustomerService(business.id);
  const leadService = getLeadService(business.id);
  const dealService = getDealService(business.id);
  const saleService = getSaleService(business.id);

  const result = await vehicleService.getVehicle(id);

  if (!result.ok) {
    notFound();
  }

  const vehicle = result.data;
  const photosResult = await vehiclePhotoService.listPhotos(vehicle.id);
  const photos = photosResult.ok ? photosResult.data : [];

  const [leads, vehicleDeals, vehicleSales] = await Promise.all([
    leadService.getLeadsForVehicle(vehicle.id),
    dealService.getDealsForVehicle(vehicle.id),
    saleService.getSalesForVehicle(vehicle.id),
  ]);
  const customerIds = Array.from(new Set(leads.map((lead) => lead.customerId)));
  const customers = await customerService.getCustomersByIds(customerIds);
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const activeDeal =
    vehicleDeals.find((deal) => deal.status !== "completed" && deal.status !== "cancelled") ?? null;
  // A vehicle can have at most one completed sale (Mission 019,
  // Section 7 — enforced by the unique index on sales.vehicleId).
  const sale = vehicleSales[0] ?? null;
  const marketing = await getMarketingPanelData(business.id, { itemType: "vehicle", itemId: vehicle.id });

  return (
    <div className="flex flex-col gap-6">
      <VehicleOverview vehicle={vehicle} canDelete={hasPermission(user.role, "vehicle.delete")} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <VehicleGallery
            photos={photos}
            vehicleLabel={`${vehicle.make} ${vehicle.model}`}
          />
          <VehicleDescription vehicle={vehicle} />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <VehicleSpecifications vehicle={vehicle} />
          {sale && <VehicleSaleSummary sale={sale} />}
          <VehicleDealSummary activeDeal={activeDeal} />
          <VehicleLeadsSummary
            vehicleId={vehicle.id}
            leads={leads}
            customersById={customersById}
          />
          <MarketingPanel
            itemRef={{ itemType: "vehicle", itemId: vehicle.id }}
            currentItemUpdatedAt={vehicle.updatedAt}
            initialContent={marketing.content}
            initialPublications={marketing.publications}
            initialChannelStatuses={marketing.channelStatuses}
            canUseMarketing={marketing.canUseMarketing}
          />
          <VehicleBusinessActions />
        </div>
      </div>
    </div>
  );
}

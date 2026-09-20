import { InventoryView } from "@/features/inventory/components/inventory-view";
import { parseInventorySearchParams } from "@/features/inventory/lib/inventory-query-params";
import { getVehiclePhotoService, getVehicleService } from "@/features/inventory/service";
import { FurnitureInventoryView } from "@/features/furniture/components/furniture-inventory-view";
import { parseFurnitureSearchParams } from "@/features/furniture/lib/furniture-query-params";
import { getFurnitureProductPhotoService, getFurnitureProductService } from "@/features/furniture/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { hasPermission } from "@/features/auth/domain/permissions";

export const metadata = { title: "Inventory · Atlas" };

type InventoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Mission 030 — this route stays a single URL/nav entry for both
 * verticals (Section 4/14: reuse the existing website/routing
 * architecture rather than building a parallel one). A business is
 * always exactly one vertical (see auth/domain/business.ts), so this
 * branch is resolved once per request from `business.vertical`, not a
 * client-side toggle — each dealer only ever sees their own vertical's
 * inventory UI, with zero new navigation entries required.
 */
export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  const { user, business } = await requireCurrentSession();
  const resolvedSearchParams = await searchParams;

  if (business.vertical === "furniture") {
    const furnitureService = getFurnitureProductService(business.id);
    const furniturePhotoService = getFurnitureProductPhotoService(business.id);
    const query = parseFurnitureSearchParams(resolvedSearchParams);

    const [paginatedProducts, counts, categories] = await Promise.all([
      furnitureService.listProductsPaged(query),
      furnitureService.countByStatus(),
      furnitureService.listDistinctCategories(),
    ]);

    const primaryPhotos = await furniturePhotoService.listPrimaryForProducts(
      paginatedProducts.items.map((product) => product.id)
    );
    const primaryPhotoUrlByProductId: Record<string, string> = {};
    for (const [productId, photo] of primaryPhotos) {
      primaryPhotoUrlByProductId[productId] = photo.url;
    }

    return (
      <FurnitureInventoryView
        result={paginatedProducts}
        query={query}
        counts={counts}
        categories={categories}
        primaryPhotoUrlByProductId={primaryPhotoUrlByProductId}
        canDeleteProduct={hasPermission(user.role, "furniture_product.delete")}
      />
    );
  }

  const vehicleService = getVehicleService(business.id);
  const vehiclePhotoService = getVehiclePhotoService(business.id);
  const query = parseInventorySearchParams(resolvedSearchParams);

  const [paginatedVehicles, counts, makes] = await Promise.all([
    vehicleService.listVehiclesPaged(query),
    vehicleService.countByStatus(),
    vehicleService.listDistinctMakes(),
  ]);

  // One batched lookup for only this page's vehicles' primary photos,
  // rather than a query per row or (as before pagination) fetching
  // primary photos for the entire inventory up front.
  const primaryPhotos = await vehiclePhotoService.listPrimaryForVehicles(
    paginatedVehicles.items.map((vehicle) => vehicle.id)
  );
  const primaryPhotoUrlByVehicleId: Record<string, string> = {};
  for (const [vehicleId, photo] of primaryPhotos) {
    primaryPhotoUrlByVehicleId[vehicleId] = photo.url;
  }

  return (
    <InventoryView
      result={paginatedVehicles}
      query={query}
      counts={counts}
      makes={makes}
      primaryPhotoUrlByVehicleId={primaryPhotoUrlByVehicleId}
      canDeleteVehicle={hasPermission(user.role, "vehicle.delete")}
    />
  );
}

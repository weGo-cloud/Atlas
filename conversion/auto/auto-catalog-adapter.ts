import { getVehicleService } from "../../inventory/service";
import type { CatalogAdapter, CatalogItem } from "../domain/catalog-adapter";

/**
 * Mission 027 (correction) — the *only* file in the conversion layer
 * that knows what a "vehicle" is. Everything above this (the
 * storefront page, the public API route handlers, ConversionService)
 * talks to vehicles only through the vertical-agnostic CatalogAdapter
 * interface. This is what "keep Auto-specific logic modular and
 * isolated from Core" means concretely here: deleting this one file
 * (and its registry entry in service/conversion-service.ts) would
 * remove Auto's presence from the conversion layer without touching
 * anything else in it.
 *
 * Reuses VehicleService.listVehiclesPaged/getVehicle (M001/M009) — no
 * new inventory query, no duplicated availability logic. Filters to
 * `status: "available"` only, the same definition of "sellable right
 * now" the rest of Atlas already uses (see M026's own stale-vehicle
 * rules).
 */
export class AutoCatalogAdapter implements CatalogAdapter {
  readonly itemNounSingular = "vehicle";
  readonly itemNounPlural = "vehicles";

  async listAvailable(businessId: string): Promise<CatalogItem[]> {
    const vehicleService = getVehicleService(businessId);
    const result = await vehicleService.listVehiclesPaged({
      status: "available",
      page: 1,
      pageSize: 60,
    });

    return result.items.map((vehicle) => ({
      id: vehicle.id,
      title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      subtitle: `${vehicle.mileage.toLocaleString()} km`,
      priceLabel: formatKes(vehicle.price),
      // No public per-vehicle detail page exists yet (see the
      // implementation summary's Limitations) — /app/inventory/[id]
      // is a staff-only authenticated route, not a valid public link.
      detailHref: null,
    }));
  }

  async resolveItemReference(businessId: string, catalogItemId: string): Promise<{ vehicleId: string } | null> {
    const vehicleService = getVehicleService(businessId);
    const result = await vehicleService.getVehicle(catalogItemId);
    if (!result.ok || result.data.status !== "available") return null;
    return { vehicleId: result.data.id };
  }
}

function formatKes(amount: number): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(
    amount
  );
}

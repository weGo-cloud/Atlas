import { getVehiclePhotoService, getVehicleService } from "@/features/inventory/service";
import { VEHICLE_STATUS_LABEL } from "@/features/inventory/data/types";
import { formatMileage, formatPriceKsh } from "@/features/inventory/lib/format";
import type { MarketingItemAdapter, MarketableItem } from "../domain/item-adapter";

/**
 * Mission 031 — the only file that knows how to turn a Vehicle into
 * GroundedFacts. Reuses the same formatting helpers the inventory UI
 * already uses (formatPriceKsh/formatMileage/VEHICLE_STATUS_LABEL) so
 * the price/mileage/status text in generated marketing copy always
 * matches what the dealer sees on the vehicle's own detail page —
 * one source of truth for how a fact is displayed, not a second
 * formatting implementation that could drift from it.
 */
export class VehicleMarketingAdapter implements MarketingItemAdapter {
  async getItem(businessId: string, itemId: string): Promise<MarketableItem | null> {
    const result = await getVehicleService(businessId).getVehicle(itemId);
    if (!result.ok) return null;
    const vehicle = result.data;

    const primaryPhotos = await getVehiclePhotoService(businessId).listPrimaryForVehicles([vehicle.id]);

    return {
      facts: {
        itemLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        priceLabel: formatPriceKsh(vehicle.price),
        availabilityLabel: VEHICLE_STATUS_LABEL[vehicle.status],
        category: null,
        condition: null,
        description: vehicle.description,
        attributes: { Mileage: formatMileage(vehicle.mileage) },
      },
      updatedAt: vehicle.updatedAt,
      primaryPhotoUrl: primaryPhotos.get(vehicle.id)?.url ?? null,
    };
  }
}

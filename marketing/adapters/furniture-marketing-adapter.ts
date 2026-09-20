import { getFurnitureProductPhotoService, getFurnitureProductService } from "@/features/furniture/service";
import {
  FURNITURE_CATEGORY_LABEL,
  FURNITURE_CONDITION_LABEL,
  FURNITURE_STATUS_LABEL,
} from "@/features/furniture/domain/furniture-product";
import { formatFurniturePrice } from "@/features/furniture/lib/format";
import type { MarketingItemAdapter, MarketableItem } from "../domain/item-adapter";

/** Mission 031 — the Furniture-vertical counterpart to VehicleMarketingAdapter. Same reuse discipline: formatting comes from the furniture feature's own lib/format.ts, not reimplemented here. */
export class FurnitureMarketingAdapter implements MarketingItemAdapter {
  async getItem(businessId: string, itemId: string): Promise<MarketableItem | null> {
    const result = await getFurnitureProductService(businessId).getProduct(itemId);
    if (!result.ok) return null;
    const product = result.data;

    const primaryPhotos = await getFurnitureProductPhotoService(businessId).listPrimaryForProducts([product.id]);

    const attributes: Record<string, string> = {};
    if (product.material) attributes.Material = product.material;
    if (product.color) attributes.Color = product.color;
    if (product.dimensions) attributes.Dimensions = product.dimensions;

    return {
      facts: {
        itemLabel: product.name,
        priceLabel: formatFurniturePrice(product.price, product.currency),
        availabilityLabel: FURNITURE_STATUS_LABEL[product.status],
        category: FURNITURE_CATEGORY_LABEL[product.category],
        condition: FURNITURE_CONDITION_LABEL[product.condition],
        description: product.description,
        attributes,
      },
      updatedAt: product.updatedAt,
      primaryPhotoUrl: primaryPhotos.get(product.id)?.url ?? null,
    };
  }
}

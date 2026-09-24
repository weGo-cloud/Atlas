import { getFurnitureProductService, getFurnitureProductPhotoService } from "../../furniture/service";
import type { CatalogAdapter, CatalogItem } from "../domain/catalog-adapter";

/**
 * Mission 030 — the Furniture vertical's counterpart to
 * AutoCatalogAdapter: the only file in the conversion layer that
 * knows what a "furniture product" is. Registering this in
 * service/conversion-service.ts's CATALOG_ADAPTERS map is the entire
 * integration — the storefront page, the public API route handlers,
 * and ConversionService's own logic don't change at all (see that
 * file's doc comment, written when this adapter didn't exist yet).
 */
export class FurnitureCatalogAdapter implements CatalogAdapter {
  readonly itemNounSingular = "item";
  readonly itemNounPlural = "items";

  async listAvailable(businessId: string): Promise<CatalogItem[]> {
    const productService = getFurnitureProductService(businessId);
    const photoService = getFurnitureProductPhotoService(businessId);

    const result = await productService.listProductsPaged({ status: "available", page: 1, pageSize: 60 });
    const primaryPhotos = await photoService.listPrimaryForProducts(result.items.map((product) => product.id));

    return result.items.map((product) => ({
      id: product.id,
      title: product.name,
      subtitle: product.dimensions,
      priceLabel: formatPrice(product.price, product.currency),
      // No public per-product detail page exists yet — same
      // limitation AutoCatalogAdapter's detailHref has (see that
      // file's comment); the storefront listing itself is the public
      // surface for now.
      detailHref: null,
      imageUrl: primaryPhotos.get(product.id)?.url ?? null,
    }));
  }

  async resolveItemReference(
    businessId: string,
    catalogItemId: string
  ): Promise<{ furnitureProductId: string } | null> {
    const productService = getFurnitureProductService(businessId);
    const result = await productService.getProduct(catalogItemId);
    if (!result.ok || result.data.status !== "available") return null;
    return { furnitureProductId: result.data.id };
  }
}

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    // Falls back gracefully if `currency` is ever something Intl doesn't recognize as a valid ISO code.
    return `${currency} ${amount.toLocaleString()}`;
  }
}

import {
  FURNITURE_CATEGORY_LABEL,
  isFurnitureCategory,
  type FurnitureProduct,
} from "../../furniture/domain/furniture-product";
import { getFurnitureProductPhotoService, getFurnitureProductService } from "../../furniture/service";
import type { AssistantCatalog, CategorySummary, SearchFilters, SearchOutcome } from "../domain/catalog";
import type { ItemFacts } from "../domain/types";
import { runSearch } from "./matching";

const PAGE_SIZE = 100;
const MAX_PAGES = 3;

function formatPriceLabel(price: number, currency: string): string {
  return currency === "KES" ? `KSh ${price.toLocaleString("en-US")}` : `${currency} ${price.toLocaleString("en-US")}`;
}

function toFacts(product: FurnitureProduct, imageUrl: string | null): ItemFacts {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    categoryLabel: FURNITURE_CATEGORY_LABEL[product.category],
    price: product.price,
    currency: product.currency,
    priceLabel: formatPriceLabel(product.price, product.currency),
    condition: product.condition,
    status: product.status,
    material: product.material,
    color: product.color,
    dimensions: product.dimensions,
    description: product.description,
    imageUrl,
  };
}

/**
 * The Furniture vertical's AssistantCatalog. Reads only through the
 * existing FurnitureProductService/PhotoService for the given business,
 * so tenant scoping is exactly the scoping the rest of Atlas relies on.
 * Colour/material/keyword matching happens in memory over the (small)
 * set of available items — the existing repository query has no such
 * filters and a schema change wasn't warranted for them.
 */
export class FurnitureAssistantCatalog implements AssistantCatalog {
  readonly itemNounSingular = "piece";
  readonly itemNounPlural = "pieces";

  constructor(private readonly businessId: string) {}

  private async loadAvailable(): Promise<ItemFacts[]> {
    const productService = getFurnitureProductService(this.businessId);
    const photoService = getFurnitureProductPhotoService(this.businessId);
    const products: FurnitureProduct[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await productService.listProductsPaged({ status: "available", page, pageSize: PAGE_SIZE });
      products.push(...result.items);
      if (page >= result.totalPages) break;
    }
    const photos = await photoService.listPrimaryForProducts(products.map((product) => product.id));
    return products.map((product) => toFacts(product, photos.get(product.id)?.url ?? null));
  }

  async search(filters: SearchFilters): Promise<SearchOutcome> {
    const category = filters.category && isFurnitureCategory(filters.category) ? filters.category : undefined;
    // An unrecognised category is dropped rather than matching nothing; the tool layer reports it back to the model.
    return runSearch(await this.loadAvailable(), { ...filters, category });
  }

  async getItem(id: string): Promise<ItemFacts | null> {
    const result = await getFurnitureProductService(this.businessId).getProduct(id);
    if (!result.ok) return null;
    const photos = await getFurnitureProductPhotoService(this.businessId).listPrimaryForProducts([id]);
    return toFacts(result.data, photos.get(id)?.url ?? null);
  }

  async listCategories(): Promise<CategorySummary[]> {
    const items = await this.loadAvailable();
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([category, count]) => ({ category, label: FURNITURE_CATEGORY_LABEL[category as keyof typeof FURNITURE_CATEGORY_LABEL] ?? category, count }))
      .sort((a, b) => b.count - a.count);
  }
}

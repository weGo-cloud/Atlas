import type { FurnitureProductPhoto } from "../domain/furniture-product-photo";

export interface FurnitureProductPhotoRepository {
  listByProductId(productId: string): Promise<FurnitureProductPhoto[]>;
  /** One batched lookup for many products — used by inventory list views to avoid N+1 queries. */
  listPrimaryForProductIds(productIds: string[]): Promise<Map<string, FurnitureProductPhoto>>;
  getById(id: string): Promise<FurnitureProductPhoto | null>;
  countByProductId(productId: string): Promise<number>;
  add(input: { furnitureProductId: string; url: string }): Promise<FurnitureProductPhoto>;
  /** Returns false if no photo existed with the given id. */
  remove(id: string): Promise<boolean>;
  reorder(productId: string, orderedIds: string[]): Promise<FurnitureProductPhoto[]>;
  setPrimary(productId: string, photoId: string): Promise<FurnitureProductPhoto[]>;
}

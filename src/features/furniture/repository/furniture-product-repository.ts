import type { FurnitureCategory, FurnitureProduct, FurnitureStatus } from "../domain/furniture-product";
import type { CreateFurnitureProductInput, UpdateFurnitureProductInput } from "../domain/furniture-product-input";
import type { FurnitureQuery, PaginatedFurnitureResult } from "../domain/furniture-product-query";

export interface FurnitureProductRepository {
  list(): Promise<FurnitureProduct[]>;
  listPaged(query: FurnitureQuery): Promise<PaginatedFurnitureResult<FurnitureProduct>>;
  getById(id: string): Promise<FurnitureProduct | null>;
  getByIds(ids: string[]): Promise<FurnitureProduct[]>;
  create(input: CreateFurnitureProductInput): Promise<FurnitureProduct>;
  /** Mission 030 — same transactional check-then-insert guard as VehicleRepository.createWithinLimit (Mission 029, Section 14); see that method's doc comment for why the count-read and the insert must happen in one synchronous database transaction. */
  createWithinLimit(
    input: CreateFurnitureProductInput,
    limit: number | null
  ): Promise<{ product: FurnitureProduct | null; currentCount: number; limitExceeded: boolean }>;
  update(id: string, input: UpdateFurnitureProductInput): Promise<FurnitureProduct | null>;
  delete(id: string): Promise<boolean>;
  countByStatus(): Promise<Record<FurnitureStatus, number>>;
  listDistinctCategories(): Promise<FurnitureCategory[]>;
}

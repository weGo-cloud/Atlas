import { DatabaseFurnitureProductRepository } from "../repository/database-furniture-product-repository";
import { DatabaseFurnitureProductPhotoRepository } from "../repository/database-furniture-product-photo-repository";
import { FurnitureProductService } from "./furniture-product-service";
import { FurnitureProductPhotoService } from "./furniture-product-photo-service";

/** Mission 030 — mirrors inventory/service/index.ts's factory-vs-singleton rationale exactly: a fresh, business-scoped repository per call, never a shared/cached instance. */
export function getFurnitureProductService(businessId: string): FurnitureProductService {
  return new FurnitureProductService(
    new DatabaseFurnitureProductRepository(businessId),
    new DatabaseFurnitureProductPhotoRepository()
  );
}

export function getFurnitureProductPhotoService(businessId: string): FurnitureProductPhotoService {
  return new FurnitureProductPhotoService(
    new DatabaseFurnitureProductPhotoRepository(),
    new DatabaseFurnitureProductRepository(businessId)
  );
}

export { FurnitureProductService, FurnitureProductPhotoService };

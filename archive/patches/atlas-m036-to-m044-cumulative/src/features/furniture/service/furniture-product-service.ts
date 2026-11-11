import type { FurnitureProduct, FurnitureCategory, FurnitureStatus } from "../domain/furniture-product";
import { canTransitionFurnitureStatus } from "../domain/furniture-product";
import {
  validateCreateFurnitureProductInput,
  validateUpdateFurnitureProductInput,
} from "../domain/validate-furniture-product-input";
import { fail, ok, type FurnitureResult } from "../domain/errors";
import type { CreateFurnitureProductInput, UpdateFurnitureProductInput } from "../domain/furniture-product-input";
import {
  normalizeFurniturePagination,
  type FurnitureQuery,
  type PaginatedFurnitureResult,
} from "../domain/furniture-product-query";
import type { FurnitureProductRepository } from "../repository/furniture-product-repository";
import type { FurnitureProductPhotoRepository } from "../repository/furniture-product-photo-repository";
import { deleteFurniturePhoto } from "@/lib/storage/furniture-photo-storage";

export type DeleteFurnitureProductOutcome = {
  mediaCleanupFailures: number;
};

/**
 * Business-facing entry point for furniture product operations —
 * mirrors VehicleService's shape and every behavioral decision
 * (validation before duplicate/limit checks, transactional
 * create-within-limit, delete-then-best-effort-file-cleanup ordering)
 * exactly, applied to furniture_products instead of vehicles.
 */
export class FurnitureProductService {
  constructor(
    private readonly repository: FurnitureProductRepository,
    private readonly photoRepository?: FurnitureProductPhotoRepository
  ) {}

  async listProducts(): Promise<FurnitureProduct[]> {
    return this.repository.list();
  }

  async listProductsPaged(query: FurnitureQuery): Promise<PaginatedFurnitureResult<FurnitureProduct>> {
    const { page, pageSize } = normalizeFurniturePagination(query);
    return this.repository.listPaged({ ...query, page, pageSize });
  }

  async countByStatus(): Promise<Record<FurnitureStatus, number>> {
    return this.repository.countByStatus();
  }

  async listDistinctCategories(): Promise<FurnitureCategory[]> {
    return this.repository.listDistinctCategories();
  }

  /** Batched lookup for multiple ids in one query — avoids N+1 when resolving lead→product references. */
  async getProductsByIds(ids: string[]): Promise<FurnitureProduct[]> {
    return this.repository.getByIds(ids);
  }

  async getProduct(id: string): Promise<FurnitureResult<FurnitureProduct>> {
    const product = await this.repository.getById(id);
    if (!product) {
      return fail({ code: "NOT_FOUND", message: `Furniture product "${id}" was not found.` });
    }
    return ok(product);
  }

  /**
   * Mission 030 — the count-check-and-insert step is delegated to
   * FurnitureProductRepository.createWithinLimit so it happens inside
   * one database transaction, closing the check-then-insert race from
   * the start (Mission 029, Section 14's fix, applied here on day
   * one rather than retrofitted). `limit` is resolved by the caller
   * via EntitlementService.resolveLimitGate — this method stays
   * commercial-platform-agnostic, accepting only a numeric cap.
   */
  async createProductWithinLimit(
    input: CreateFurnitureProductInput,
    limit: number | null
  ): Promise<FurnitureResult<FurnitureProduct>> {
    const fieldErrors = validateCreateFurnitureProductInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      return fail({ code: "VALIDATION_ERROR", message: "Furniture product data is invalid.", fieldErrors });
    }

    try {
      const result = await this.repository.createWithinLimit(input, limit);
      if (result.limitExceeded || !result.product) {
        return fail({
          code: "LIMIT_EXCEEDED",
          message:
            limit !== null
              ? `Your plan allows up to ${limit} furniture products. Upgrade your plan to add more.`
              : "Your plan allows unlimited furniture products, but the product could not be created. Please try again.",
        });
      }
      return ok(result.product);
    } catch {
      return fail({ code: "REPOSITORY_ERROR", message: "Could not create the furniture product. Please try again." });
    }
  }

  async updateProduct(id: string, input: UpdateFurnitureProductInput): Promise<FurnitureResult<FurnitureProduct>> {
    const fieldErrors = validateUpdateFurnitureProductInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      return fail({ code: "VALIDATION_ERROR", message: "Furniture product data is invalid.", fieldErrors });
    }

    try {
      const product = await this.repository.update(id, input);
      if (!product) {
        return fail({ code: "NOT_FOUND", message: `Furniture product "${id}" was not found.` });
      }
      return ok(product);
    } catch {
      return fail({ code: "REPOSITORY_ERROR", message: "Could not update the furniture product. Please try again." });
    }
  }

  /** Applies a status (availability) transition, validated against the allowed-transition table in domain/furniture-product.ts. */
  async updateProductStatus(id: string, targetStatus: FurnitureStatus): Promise<FurnitureResult<FurnitureProduct>> {
    const product = await this.repository.getById(id);
    if (!product) {
      return fail({ code: "NOT_FOUND", message: `Furniture product "${id}" was not found.` });
    }

    if (!canTransitionFurnitureStatus(product.status, targetStatus)) {
      return fail({
        code: "INVALID_STATUS_TRANSITION",
        message: `Cannot change availability from "${product.status}" to "${targetStatus}".`,
      });
    }

    try {
      const updated = await this.repository.update(id, { status: targetStatus });
      if (!updated) {
        return fail({ code: "NOT_FOUND", message: `Furniture product "${id}" was not found.` });
      }
      return ok(updated);
    } catch {
      return fail({ code: "REPOSITORY_ERROR", message: "Could not update availability. Please try again." });
    }
  }

  /**
   * Deletes a furniture product and cleans up its photo files. Same
   * sequencing as VehicleService.deleteVehicle: the database row (and
   * its cascading photo metadata) is deleted first, then the
   * underlying files are removed from disk, best-effort — see that
   * method's doc comment for the failure-mode rationale.
   */
  async deleteProduct(id: string): Promise<FurnitureResult<DeleteFurnitureProductOutcome>> {
    const product = await this.repository.getById(id);
    if (!product) {
      return fail({ code: "NOT_FOUND", message: `Furniture product "${id}" was not found.` });
    }

    const photos = this.photoRepository ? await this.photoRepository.listByProductId(id) : [];

    let deleted: boolean;
    try {
      deleted = await this.repository.delete(id);
    } catch {
      return fail({ code: "REPOSITORY_ERROR", message: "Could not delete the furniture product. Please try again." });
    }

    if (!deleted) {
      return fail({ code: "NOT_FOUND", message: `Furniture product "${id}" was not found.` });
    }

    let mediaCleanupFailures = 0;
    for (const photo of photos) {
      try {
        await deleteFurniturePhoto(photo.url);
      } catch {
        mediaCleanupFailures += 1;
      }
    }

    return ok({ mediaCleanupFailures });
  }
}

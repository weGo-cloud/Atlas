import type { Vehicle, VehicleStatus } from "../data/types";
import {
  validateCreateVehicleInput,
  validateUpdateVehicleInput,
} from "../domain/validate-vehicle-input";
import { fail, ok, type ServiceResult } from "../domain/errors";
import type { CreateVehicleInput, UpdateVehicleInput } from "../domain/vehicle-input";
import {
  normalizePagination,
  type PaginatedResult,
  type VehicleQuery,
} from "../domain/vehicle-query";
import { canTransitionStatus } from "../domain/vehicle-status";
import type { VehicleRepository } from "../repository/vehicle-repository";
import type { VehiclePhotoRepository } from "../repository/vehicle-photo-repository";
import { deleteVehiclePhoto } from "@/lib/storage/vehicle-photo-storage";

export type DeleteVehicleOutcome = {
  /** Number of the vehicle's photo files that could not be removed from disk. The DB row and its photo metadata are already gone regardless. */
  mediaCleanupFailures: number;
};

/**
 * Business-facing entry point for vehicle operations. The UI (and the
 * server actions that front it) call this — never the repository
 * directly — so swapping MockVehicleRepository for a real database
 * repository later requires no changes above this layer.
 *
 * photoRepository is optional so existing tests that only care about
 * vehicle CRUD can keep constructing `new VehicleService(repo)`
 * without wiring photos — when absent, deleteVehicle simply skips
 * file cleanup (there's nothing to clean up if photos were never
 * tracked in the first place, e.g. in unit tests using MockVehicleRepository alone).
 */
export class VehicleService {
  constructor(
    private readonly repository: VehicleRepository,
    private readonly photoRepository?: VehiclePhotoRepository
  ) {}

  async listVehicles(): Promise<Vehicle[]> {
    return this.repository.list();
  }

  async listVehiclesPaged(
    query: VehicleQuery
  ): Promise<PaginatedResult<Vehicle>> {
    const { page, pageSize } = normalizePagination(query);
    return this.repository.listPaged({ ...query, page, pageSize });
  }

  async countByStatus(): Promise<Record<VehicleStatus, number>> {
    return this.repository.countByStatus();
  }

  async listDistinctMakes(): Promise<string[]> {
    return this.repository.listDistinctMakes();
  }

  /** Batched lookup for multiple ids in one query — avoids N+1 when resolving lead→vehicle references. */
  async getVehiclesByIds(ids: string[]): Promise<Vehicle[]> {
    return this.repository.getByIds(ids);
  }

  async getVehicle(id: string): Promise<ServiceResult<Vehicle>> {
    const vehicle = await this.repository.getById(id);
    if (!vehicle) {
      return fail({
        code: "NOT_FOUND",
        message: `Vehicle "${id}" was not found.`,
      });
    }
    return ok(vehicle);
  }

  async createVehicle(
    input: CreateVehicleInput
  ): Promise<ServiceResult<Vehicle>> {
    const fieldErrors = validateCreateVehicleInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      return fail({
        code: "VALIDATION_ERROR",
        message: "Vehicle data is invalid.",
        fieldErrors,
      });
    }

    const duplicate = await this.repository.findByStockId(input.stockId);
    if (duplicate) {
      return fail({
        code: "DUPLICATE_STOCK_ID",
        message: `Stock ID "${input.stockId}" is already in use.`,
        fieldErrors: { stockId: "This stock ID is already in use." },
      });
    }

    try {
      const vehicle = await this.repository.create(input);
      return ok(vehicle);
    } catch {
      return fail({
        code: "REPOSITORY_ERROR",
        message: "Could not create the vehicle. Please try again.",
      });
    }
  }

  /**
   * Mission 029, Section 14 — same validation/duplicate-check path as
   * createVehicle, but the count-check-and-insert step is delegated to
   * VehicleRepository.createWithinLimit so it happens inside one
   * database transaction instead of the action layer's old separate
   * "count, then check, then create" calls. `limit` is resolved by
   * the caller (via EntitlementService.resolveLimitGate) — this
   * method stays exactly as commercial-platform-agnostic as
   * createVehicle always has been; it just accepts a numeric cap
   * instead of implicitly having none.
   */
  async createVehicleWithinLimit(
    input: CreateVehicleInput,
    limit: number | null
  ): Promise<ServiceResult<Vehicle>> {
    const fieldErrors = validateCreateVehicleInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      return fail({
        code: "VALIDATION_ERROR",
        message: "Vehicle data is invalid.",
        fieldErrors,
      });
    }

    const duplicate = await this.repository.findByStockId(input.stockId);
    if (duplicate) {
      return fail({
        code: "DUPLICATE_STOCK_ID",
        message: `Stock ID "${input.stockId}" is already in use.`,
        fieldErrors: { stockId: "This stock ID is already in use." },
      });
    }

    try {
      const result = await this.repository.createWithinLimit(input, limit);
      if (result.limitExceeded || !result.vehicle) {
        return fail({
          code: "LIMIT_EXCEEDED",
          message:
            limit !== null
              ? `Your plan allows up to ${limit} vehicles. Upgrade your plan to add more.`
              : "Your plan allows unlimited vehicles, but the vehicle could not be created. Please try again.",
        });
      }
      return ok(result.vehicle);
    } catch {
      return fail({
        code: "REPOSITORY_ERROR",
        message: "Could not create the vehicle. Please try again.",
      });
    }
  }

  async updateVehicle(
    id: string,
    input: UpdateVehicleInput
  ): Promise<ServiceResult<Vehicle>> {
    const fieldErrors = validateUpdateVehicleInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      return fail({
        code: "VALIDATION_ERROR",
        message: "Vehicle data is invalid.",
        fieldErrors,
      });
    }

    if (input.stockId) {
      const duplicate = await this.repository.findByStockId(input.stockId);
      if (duplicate && duplicate.id !== id) {
        return fail({
          code: "DUPLICATE_STOCK_ID",
          message: `Stock ID "${input.stockId}" is already in use.`,
          fieldErrors: { stockId: "This stock ID is already in use." },
        });
      }
    }

    try {
      const vehicle = await this.repository.update(id, input);
      if (!vehicle) {
        return fail({
          code: "NOT_FOUND",
          message: `Vehicle "${id}" was not found.`,
        });
      }
      return ok(vehicle);
    } catch {
      return fail({
        code: "REPOSITORY_ERROR",
        message: "Could not update the vehicle. Please try again.",
      });
    }
  }

  /**
   * Applies a status transition, validated against the allowed-
   * transition table in domain/vehicle-status.ts. This is the only
   * path status changes are meant to go through — never a raw
   * `updateVehicle(id, { status })` call from the UI.
   */
  async updateVehicleStatus(
    id: string,
    targetStatus: VehicleStatus
  ): Promise<ServiceResult<Vehicle>> {
    const vehicle = await this.repository.getById(id);
    if (!vehicle) {
      return fail({
        code: "NOT_FOUND",
        message: `Vehicle "${id}" was not found.`,
      });
    }

    if (!canTransitionStatus(vehicle.status, targetStatus)) {
      return fail({
        code: "INVALID_STATUS_TRANSITION",
        message: `Cannot change status from "${vehicle.status}" to "${targetStatus}".`,
      });
    }

    try {
      const updated = await this.repository.update(id, {
        status: targetStatus,
      });
      if (!updated) {
        return fail({
          code: "NOT_FOUND",
          message: `Vehicle "${id}" was not found.`,
        });
      }
      return ok(updated);
    } catch {
      return fail({
        code: "REPOSITORY_ERROR",
        message: "Could not update vehicle status. Please try again.",
      });
    }
  }

  /**
   * Deletes a vehicle and cleans up its photo files.
   *
   * Sequencing matters here: the database row is deleted first (its
   * photo metadata rows cascade automatically), and only then are the
   * underlying photo files removed from disk, best-effort. That order
   * means the failure mode if the process dies mid-cleanup is orphaned
   * files taking up disk space — never a vehicle whose photos are
   * gone from the DB but whose stale files are still linkable, and
   * never a vehicle that fails to delete because a single photo file
   * wouldn't remove. A SQLite transaction can make the row+cascade
   * deletion atomic; it cannot make filesystem deletion part of that
   * same transaction, so file cleanup is deliberately a separate,
   * best-effort step afterward rather than something the caller
   * should expect to roll back.
   */
  async deleteVehicle(id: string): Promise<ServiceResult<DeleteVehicleOutcome>> {
    const vehicle = await this.repository.getById(id);
    if (!vehicle) {
      return fail({
        code: "NOT_FOUND",
        message: `Vehicle "${id}" was not found.`,
      });
    }

    const photos = this.photoRepository
      ? await this.photoRepository.listByVehicleId(id)
      : [];

    let deleted: boolean;
    try {
      deleted = await this.repository.delete(id);
    } catch {
      return fail({
        code: "REPOSITORY_ERROR",
        message: "Could not delete the vehicle. Please try again.",
      });
    }

    if (!deleted) {
      return fail({
        code: "NOT_FOUND",
        message: `Vehicle "${id}" was not found.`,
      });
    }

    let mediaCleanupFailures = 0;
    for (const photo of photos) {
      try {
        await deleteVehiclePhoto(photo.url);
      } catch {
        mediaCleanupFailures += 1;
      }
    }

    return ok({ mediaCleanupFailures });
  }
}

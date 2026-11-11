import type { CustomerRepository } from "../../customers/repository/customer-repository";
import type { VehicleRepository } from "../../inventory/repository/vehicle-repository";
import type { LeadRepository } from "../../leads/repository/lead-repository";
import type { Deal, DealStatus } from "../domain/deal";
import { isDealStatus } from "../domain/deal";
import { canTransitionDealStatus } from "../domain/deal-status";
import { failDeal, okDeal, type DealResult } from "../domain/errors";
import type { CreateDealInput, UpdateDealInput } from "../domain/deal-input";
import type { DealFilter, DealQuery, PaginatedDealResult } from "../domain/deal-query";
import { normalizeDealPagination } from "../domain/deal-query";
import type { DealRepository } from "../repository/deal-repository";
import { DuplicateActiveDealError } from "../repository/database-deal-repository";
import { applyDealStatusTransitionAtomically } from "./deal-vehicle-transaction";

/**
 * Depends on CustomerRepository, VehicleRepository, and LeadRepository
 * (not their services) for read-only relationship validation — the
 * same cross-feature pattern LeadService uses for Customer/Vehicle.
 *
 * Mission 018.1 — the Deal status transition itself, and its required
 * Vehicle status side effect, are no longer applied as two separate
 * calls through VehicleService/DealRepository. Both now happen inside
 * one atomic database transaction (see deal-vehicle-transaction.ts),
 * so VehicleService is no longer a dependency of this class at all.
 */
export class DealService {
  constructor(
    private readonly repository: DealRepository,
    private readonly leadRepository: LeadRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly vehicleRepository: VehicleRepository
  ) {}

  async createDeal(input: CreateDealInput): Promise<DealResult<Deal>> {
    if (!input.leadId || !input.leadId.trim()) {
      return failDeal({
        code: "VALIDATION_ERROR",
        message: "An originating lead is required to create a deal.",
        fieldErrors: { leadId: "A lead is required." },
      });
    }

    const lead = await this.leadRepository.getLeadById(input.leadId);
    if (!lead) {
      return failDeal({
        code: "LEAD_NOT_FOUND",
        message: `Lead "${input.leadId}" was not found.`,
      });
    }

    const customer = await this.customerRepository.getCustomerById(lead.customerId);
    if (!customer) {
      return failDeal({ code: "CUSTOMER_NOT_FOUND", message: "This lead's customer was not found." });
    }

    // Mission 018, Section 5 — the deal's vehicle defaults to the
    // lead's vehicle of interest, but a caller may deliberately
    // supply a different one (e.g. the customer switches interest to
    // a comparable unit while negotiating). Either way, resolution
    // never trusts a client-supplied customerId — there isn't one on
    // CreateDealInput at all; the customer is always derived from the
    // lead itself, which is what makes "Lead A → Customer B" the kind
    // of mismatch that's structurally impossible here rather than
    // merely checked for.
    const vehicleId = input.vehicleId ?? lead.vehicleId ?? null;
    if (!vehicleId) {
      return failDeal({
        code: "VEHICLE_REQUIRED",
        message:
          "A deal must have a vehicle. This lead has no vehicle of interest — select one to create the deal.",
        fieldErrors: { vehicleId: "A vehicle is required." },
      });
    }

    const vehicle = await this.vehicleRepository.getById(vehicleId);
    if (!vehicle) {
      return failDeal({
        code: "VEHICLE_NOT_FOUND",
        message: `Vehicle "${vehicleId}" was not found.`,
      });
    }

    const agreedPrice = input.agreedPrice ?? vehicle.price;
    const priceError = validatePrice(agreedPrice, "agreedPrice");
    if (priceError) return failDeal(priceError);

    if (input.depositAmount !== undefined && input.depositAmount !== null) {
      const depositError = validatePrice(input.depositAmount, "depositAmount");
      if (depositError) return failDeal(depositError);
      if (input.depositAmount > agreedPrice) {
        return failDeal({
          code: "VALIDATION_ERROR",
          message: "The deposit cannot exceed the agreed price.",
          fieldErrors: { depositAmount: "Cannot exceed the agreed price." },
        });
      }
    }

    // Fast-path check — a clean, immediate error in the common
    // (non-racing) case. The actual concurrency-safe guarantee is the
    // partial unique index on (leadId) for non-terminal statuses (see
    // schema.ts); a concurrent duplicate that slips past this check
    // is still caught by the DB constraint below.
    const existingActive = await this.repository.getActiveDealForLead(input.leadId);
    if (existingActive) {
      return failDeal({
        code: "DUPLICATE_ACTIVE_DEAL",
        message: "This lead already has an active deal in progress.",
      });
    }

    const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    try {
      const deal = await this.repository.createDeal({
        customerId: lead.customerId,
        leadId: input.leadId,
        vehicleId,
        vehicleLabel,
        agreedPrice,
        depositAmount: input.depositAmount ?? null,
        notes: input.notes ?? "",
      });
      return okDeal(deal);
    } catch (error) {
      if (error instanceof DuplicateActiveDealError) {
        return failDeal({
          code: "DUPLICATE_ACTIVE_DEAL",
          message: "This lead already has an active deal in progress.",
        });
      }
      return failDeal({
        code: "REPOSITORY_ERROR",
        message: "Could not create the deal. Please try again.",
      });
    }
  }

  async getDeal(id: string): Promise<DealResult<Deal>> {
    const deal = await this.repository.getDealById(id);
    if (!deal) {
      return failDeal({ code: "NOT_FOUND", message: `Deal "${id}" was not found.` });
    }
    return okDeal(deal);
  }

  async listDeals(filter?: DealFilter): Promise<Deal[]> {
    return this.repository.getDeals(filter);
  }

  async listDealsPaged(query: DealQuery): Promise<PaginatedDealResult<Deal>> {
    const { page, pageSize } = normalizeDealPagination(query);
    return this.repository.getDealsPaged({ ...query, page, pageSize });
  }

  async getDealsForCustomer(customerId: string): Promise<Deal[]> {
    return this.repository.getDealsForCustomer(customerId);
  }

  async getDealsForLead(leadId: string): Promise<Deal[]> {
    return this.repository.getDealsForLead(leadId);
  }

  async getDealsForVehicle(vehicleId: string): Promise<Deal[]> {
    return this.repository.getDealsForVehicle(vehicleId);
  }

  async getActiveDealForLead(leadId: string): Promise<Deal | null> {
    return this.repository.getActiveDealForLead(leadId);
  }

  async updateDeal(id: string, input: UpdateDealInput): Promise<DealResult<Deal>> {
    const existing = await this.repository.getDealById(id);
    if (!existing) {
      return failDeal({ code: "NOT_FOUND", message: `Deal "${id}" was not found.` });
    }

    // Mission 018, Section 17 — a completed or cancelled deal is
    // historical; editing its commercial terms after the fact would
    // rewrite that history rather than preserve it.
    if (existing.status === "completed" || existing.status === "cancelled") {
      return failDeal({
        code: "VALIDATION_ERROR",
        message: `Cannot edit a ${existing.status} deal — its terms are part of the historical record.`,
      });
    }

    const nextAgreedPrice = input.agreedPrice ?? existing.agreedPrice;
    if (input.agreedPrice !== undefined) {
      const priceError = validatePrice(input.agreedPrice, "agreedPrice");
      if (priceError) return failDeal(priceError);
    }

    if (input.depositAmount !== undefined && input.depositAmount !== null) {
      const depositError = validatePrice(input.depositAmount, "depositAmount");
      if (depositError) return failDeal(depositError);
      if (input.depositAmount > nextAgreedPrice) {
        return failDeal({
          code: "VALIDATION_ERROR",
          message: "The deposit cannot exceed the agreed price.",
          fieldErrors: { depositAmount: "Cannot exceed the agreed price." },
        });
      }
    }

    try {
      const deal = await this.repository.updateDeal(id, input);
      if (!deal) {
        return failDeal({ code: "NOT_FOUND", message: `Deal "${id}" was not found.` });
      }
      return okDeal(deal);
    } catch {
      return failDeal({
        code: "REPOSITORY_ERROR",
        message: "Could not update the deal. Please try again.",
      });
    }
  }

  /**
   * Applies a status transition, validated against
   * domain/deal-status.ts's allowed-transition table, and drives the
   * vehicle's own status where the transition implies it — atomically,
   * as a single database transaction (Mission 018.1). See
   * deal-vehicle-transaction.ts for the transition→required-vehicle-
   * status mapping and the full atomicity rationale:
   *
   * - → reserved: reserves the vehicle. Blocked (VEHICLE_UNAVAILABLE)
   *   if the vehicle can't currently be reserved (e.g. already
   *   reserved under a different deal, or already sold) — this is
   *   what actually prevents two deals from both holding the same
   *   vehicle, since Deal has no vehicle-exclusivity table of its
   *   own and rides entirely on the vehicle's existing status
   *   machine (Mission 008) for that guarantee.
   * - → completed: marks the vehicle sold. Also blocked
   *   (VEHICLE_UNAVAILABLE) if the vehicle isn't in a state that can
   *   become sold — including when it's already sold via a different
   *   deal (Mission 018.1, Section 3: a deal must not become
   *   "completed" merely because its vehicle already is — that's
   *   treated as a real rejection, not silently skipped as a no-op).
   * - reserved → negotiating / cancelled: releases the vehicle back
   *   to available, best-effort — if the vehicle isn't in "reserved"
   *   any more for some other reason, there's nothing to release, and
   *   that's not treated as an error blocking the deal's own
   *   transition.
   *
   * Concurrency: the vehicle-side mutation and the deal's own status
   * update happen inside one atomic transaction — if the required
   * vehicle transition is rejected, the deal's status update never
   * happens either, and vice versa; no partial Deal/Vehicle state can
   * result (Mission 018.1, Section 2/6). This closes the narrow race
   * Mission 018's final report flagged as a known, accepted
   * limitation when the two mutations were separate statements.
   */
  async updateDealStatus(id: string, targetStatus: DealStatus): Promise<DealResult<Deal>> {
    if (!isDealStatus(targetStatus)) {
      return failDeal({
        code: "VALIDATION_ERROR",
        message: `"${targetStatus}" is not a valid deal status.`,
      });
    }

    const deal = await this.repository.getDealById(id);
    if (!deal) {
      return failDeal({ code: "NOT_FOUND", message: `Deal "${id}" was not found.` });
    }

    if (!canTransitionDealStatus(deal.status, targetStatus)) {
      const message =
        deal.status === targetStatus
          ? `Deal is already "${deal.status}".`
          : `Cannot move a deal from "${deal.status}" to "${targetStatus}".`;
      return failDeal({ code: "INVALID_STATUS_TRANSITION", message });
    }

    try {
      const outcome = applyDealStatusTransitionAtomically(deal.businessId, id, deal.status, targetStatus);

      if (outcome.ok) {
        return okDeal(outcome.deal);
      }

      switch (outcome.reason) {
        case "STALE_STATUS":
          return failDeal({
            code: "INVALID_STATUS_TRANSITION",
            message: "This deal's status changed before your update could be applied. Please refresh and try again.",
          });
        case "VEHICLE_NOT_FOUND":
        case "VEHICLE_UNAVAILABLE":
          return failDeal({
            code: "VEHICLE_UNAVAILABLE",
            message:
              targetStatus === "completed"
                ? "Could not mark the vehicle as sold to complete this deal — it may already be sold or reserved under another deal."
                : "This vehicle can't be reserved right now — it may already be reserved or sold under another deal.",
          });
      }
    } catch {
      return failDeal({
        code: "REPOSITORY_ERROR",
        message: "Could not update the deal status. Please try again.",
      });
    }
  }
}

type PriceValidationError = { code: "VALIDATION_ERROR"; message: string; fieldErrors: Record<string, string> };

function validatePrice(value: number, field: "agreedPrice" | "depositAmount"): PriceValidationError | null {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return {
      code: "VALIDATION_ERROR",
      message:
        field === "agreedPrice"
          ? "Agreed price must be a positive whole number."
          : "Deposit must be a positive whole number.",
      fieldErrors: { [field]: "Must be a positive whole number." },
    };
  }
  return null;
}

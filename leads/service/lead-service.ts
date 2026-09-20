import type { CustomerRepository } from "../../customers/repository/customer-repository";
import type { VehicleRepository } from "../../inventory/repository/vehicle-repository";
import type { FurnitureProductRepository } from "../../furniture/repository/furniture-product-repository";
import type { Lead, LeadStatus } from "../domain/lead";
import { isLeadStatus } from "../domain/lead";
import { canTransitionLeadStatus } from "../domain/lead-status";
import { failLead, okLead, type LeadResult } from "../domain/errors";
import type { CreateLeadInput, UpdateLeadInput } from "../domain/lead-input";
import type { LeadFilter, LeadQuery, PaginatedLeadResult } from "../domain/lead-query";
import { normalizeLeadPagination } from "../domain/lead-query";
import type { LeadRepository } from "../repository/lead-repository";

/**
 * Depends on CustomerRepository and VehicleRepository (not their
 * services) to validate that referenced records exist — this is a
 * read-only existence check, not a business-rule delegation, so
 * reaching past the sibling services to their repositories directly
 * avoids a service-depends-on-service layering for what's fundamentally
 * a foreign-key-style validation. Mirrors the cross-feature dependency
 * pattern already established by VehiclePhotoService (Mission 007) and
 * VehicleService's photo cleanup (Mission 008).
 *
 * Mission 030 — furnitureRepository is a fourth, optional constructor
 * parameter (not a required one) so every existing call site that
 * constructs `new LeadService(repo, customerRepo, vehicleRepo)` with
 * exactly three arguments keeps compiling unchanged. Optional here has
 * the same meaning VehicleService's optional photoRepository already
 * has: when absent, the furnitureProductId path simply isn't
 * available (createLead treats a furnitureProductId input as
 * unresolvable rather than crashing) — getLeadService always wires
 * both repositories in production, so this only matters for tests
 * that construct LeadService directly and don't care about furniture.
 * Section 13's "Atlas's CRM should remain vertical-neutral" is
 * satisfied by LeadService itself containing no furniture- or
 * vehicle-specific *business logic* — both branches below are the
 * same shape, just pointed at a different repository.
 */
export class LeadService {
  constructor(
    private readonly repository: LeadRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly furnitureRepository?: FurnitureProductRepository
  ) {}

  async createLead(input: CreateLeadInput): Promise<LeadResult<Lead>> {
    if (!input.customerId || !input.customerId.trim()) {
      return failLead({
        code: "VALIDATION_ERROR",
        message: "A customer is required to create a lead.",
        fieldErrors: { customerId: "A customer is required." },
      });
    }

    const customer = await this.customerRepository.getCustomerById(input.customerId);
    if (!customer) {
      return failLead({
        code: "CUSTOMER_NOT_FOUND",
        message: `Customer "${input.customerId}" was not found.`,
      });
    }

    let vehicleLabel: string | null = null;
    if (input.vehicleId) {
      const vehicle = await this.vehicleRepository.getById(input.vehicleId);
      if (!vehicle) {
        return failLead({
          code: "VEHICLE_NOT_FOUND",
          message: `Vehicle "${input.vehicleId}" was not found.`,
        });
      }
      vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    }

    let furnitureProductLabel: string | null = null;
    if (input.furnitureProductId) {
      const product = this.furnitureRepository
        ? await this.furnitureRepository.getById(input.furnitureProductId)
        : null;
      if (!product) {
        return failLead({
          code: "FURNITURE_PRODUCT_NOT_FOUND",
          message: `Furniture product "${input.furnitureProductId}" was not found.`,
        });
      }
      furnitureProductLabel = product.name;
    }

    try {
      const lead = await this.repository.createLead({ ...input, vehicleLabel, furnitureProductLabel });
      return okLead(lead);
    } catch {
      return failLead({
        code: "REPOSITORY_ERROR",
        message: "Could not create the lead. Please try again.",
      });
    }
  }

  async getLead(id: string): Promise<LeadResult<Lead>> {
    const lead = await this.repository.getLeadById(id);
    if (!lead) {
      return failLead({ code: "NOT_FOUND", message: `Lead "${id}" was not found.` });
    }
    return okLead(lead);
  }

  async listLeads(filter?: LeadFilter): Promise<Lead[]> {
    return this.repository.getLeads(filter);
  }

  /** Mission 015 — database-limited pagination, mirroring VehicleService.listVehiclesPaged. */
  async listLeadsPaged(query: LeadQuery): Promise<PaginatedLeadResult<Lead>> {
    const { page, pageSize } = normalizeLeadPagination(query);
    return this.repository.getLeadsPaged({ ...query, page, pageSize });
  }

  async getLeadsForCustomer(customerId: string): Promise<Lead[]> {
    return this.repository.getLeadsForCustomer(customerId);
  }

  async getLeadsForVehicle(vehicleId: string): Promise<Lead[]> {
    return this.repository.getLeadsForVehicle(vehicleId);
  }

  async getLeadsForFurnitureProduct(furnitureProductId: string): Promise<Lead[]> {
    return this.repository.getLeadsForFurnitureProduct(furnitureProductId);
  }

  async getRecentLeads(limit: number): Promise<Lead[]> {
    return this.repository.getRecentLeads(limit);
  }

  async updateLead(id: string, input: UpdateLeadInput): Promise<LeadResult<Lead>> {
    try {
      const lead = await this.repository.updateLead(id, input);
      if (!lead) {
        return failLead({ code: "NOT_FOUND", message: `Lead "${id}" was not found.` });
      }
      return okLead(lead);
    } catch {
      return failLead({
        code: "REPOSITORY_ERROR",
        message: "Could not update the lead. Please try again.",
      });
    }
  }

  async updateLeadStatus(id: string, targetStatus: LeadStatus): Promise<LeadResult<Lead>> {
    // Defense against a forged server-action call: TypeScript's
    // LeadStatus type only guards call sites within this codebase,
    // not the actual runtime value a client can send over the wire.
    // Without this check, a garbage string would pass the `from !==
    // to` transition check below (anything differs from a real
    // status) and get written straight into the database.
    if (!isLeadStatus(targetStatus)) {
      return failLead({
        code: "VALIDATION_ERROR",
        message: `"${targetStatus}" is not a valid lead status.`,
      });
    }

    const lead = await this.repository.getLeadById(id);
    if (!lead) {
      return failLead({ code: "NOT_FOUND", message: `Lead "${id}" was not found.` });
    }

    if (!canTransitionLeadStatus(lead.status, targetStatus)) {
      const message =
        lead.status === targetStatus
          ? `Lead is already "${lead.status}".`
          : `Cannot move a lead directly from "${lead.status}" to "${targetStatus}" — reopen it to an active status first.`;
      return failLead({ code: "INVALID_STATUS_TRANSITION", message });
    }

    try {
      const updated = await this.repository.updateLeadStatus(id, targetStatus);
      if (!updated) {
        return failLead({ code: "NOT_FOUND", message: `Lead "${id}" was not found.` });
      }
      return okLead(updated);
    } catch {
      return failLead({
        code: "REPOSITORY_ERROR",
        message: "Could not update the lead status. Please try again.",
      });
    }
  }

  /**
   * Mission 017 — the explicit follow-up-completion mechanism Section
   * 16 asks for. Deliberately separate from updateLeadStatus: a
   * follow-up can be completed independent of any status change (e.g.
   * "I called them, still qualified, next follow-up done"), and the
   * "was one even scheduled" check only makes sense here. Duplicate
   * completion is naturally prevented — nextFollowUpAt is null after
   * the first completion, so a second attempt rejects for the same
   * reason a never-scheduled one would.
   *
   * Race fix: the initial getLeadById here is only for a fast, clear
   * error message in the common (non-racing) case — NOT_FOUND vs
   * NO_SCHEDULED_FOLLOW_UP. The actual safety against concurrent
   * completion lives entirely in the repository's atomic conditional
   * UPDATE (see completeFollowUp there): if repository.completeFollowUp
   * returns null after this method's own existence check already
   * passed, that null can only mean the row's nextFollowUpAt was no
   * longer set by the time the UPDATE ran — i.e. a concurrent call won
   * the race — so it's reported the same way a never-scheduled
   * follow-up would be, not as NOT_FOUND (the lead does exist).
   */
  async completeFollowUp(id: string): Promise<LeadResult<Lead>> {
    const lead = await this.repository.getLeadById(id);
    if (!lead) {
      return failLead({ code: "NOT_FOUND", message: `Lead "${id}" was not found.` });
    }

    if (!lead.nextFollowUpAt) {
      return failLead({
        code: "NO_SCHEDULED_FOLLOW_UP",
        message: "This lead has no scheduled follow-up to complete.",
      });
    }

    try {
      const updated = await this.repository.completeFollowUp(id);
      if (!updated) {
        // The lead existed a moment ago (checked above) — so getting
        // nothing back here means the atomic UPDATE's precondition
        // (nextFollowUpAt IS NOT NULL) no longer matched, almost
        // certainly because a concurrent completion already cleared
        // it. Same user-facing error as "nothing was ever scheduled":
        // either way, there's nothing left for this call to complete.
        return failLead({
          code: "NO_SCHEDULED_FOLLOW_UP",
          message: "This lead has no scheduled follow-up to complete.",
        });
      }
      return okLead(updated);
    } catch {
      return failLead({
        code: "REPOSITORY_ERROR",
        message: "Could not complete the follow-up. Please try again.",
      });
    }
  }

  async countByStatus(): Promise<Record<LeadStatus, number>> {
    return this.repository.countByStatus();
  }

  async countLeadsByVehicle(limit: number): Promise<{ vehicleId: string; count: number }[]> {
    return this.repository.countLeadsByVehicle(limit);
  }
}

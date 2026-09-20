import type { VehicleRepository } from "../../inventory/repository/vehicle-repository";
import type { DealRepository } from "../../deals/repository/deal-repository";
import type { Sale } from "../domain/sale";
import { failSale, okSale, type SaleResult } from "../domain/errors";
import type { CreateSaleInput } from "../domain/sale-input";
import type { SaleFilter, SaleQuery, PaginatedSaleResult } from "../domain/sale-query";
import { normalizeSalePagination } from "../domain/sale-query";
import type { SaleRepository } from "../repository/sale-repository";
import { DuplicateSaleError, VehicleAlreadySoldError } from "../repository/database-sale-repository";

/**
 * Mission 019. Depends on DealRepository and VehicleRepository (not
 * their services) for read-only relationship validation — the same
 * cross-feature pattern DealService itself uses for Lead/Customer/
 * Vehicle.
 *
 * Deliberately performs NO vehicle mutation. By the time a Deal
 * reaches `completed`, Mission 018.1's atomic transaction has already
 * marked its vehicle `sold` — redoing that here would be exactly the
 * "redundant or contradictory update" Mission 019, Section 8 warns
 * against. This service only *validates* that the vehicle is already
 * in the state Deal completion guarantees; if it somehow isn't (a
 * data-integrity anomaly this should never actually observe), Sale
 * creation is rejected rather than silently "fixing" the vehicle.
 */
export class SaleService {
  constructor(
    private readonly repository: SaleRepository,
    private readonly dealRepository: DealRepository,
    private readonly vehicleRepository: VehicleRepository
  ) {}

  async createSale(input: CreateSaleInput): Promise<SaleResult<Sale>> {
    if (!input.dealId || !input.dealId.trim()) {
      return failSale({
        code: "VALIDATION_ERROR",
        message: "An originating deal is required to create a sale.",
        fieldErrors: { dealId: "A deal is required." },
      });
    }

    const deal = await this.dealRepository.getDealById(input.dealId);
    if (!deal) {
      return failSale({ code: "DEAL_NOT_FOUND", message: `Deal "${input.dealId}" was not found.` });
    }

    // Mission 019, Section 3 — strict by default: only a completed
    // Deal may produce a Sale. Draft, negotiating, reserved, and
    // cancelled are all rejected with no special-case exception.
    if (deal.status !== "completed") {
      return failSale({
        code: "DEAL_NOT_COMPLETED",
        message: `Only a completed deal can produce a sale (this deal is "${deal.status}").`,
      });
    }

    // Fast-path check — the actual concurrency-safe guarantee is the
    // unique index on sales.dealId (see schema.ts); a concurrent
    // duplicate that slips past this check is still caught there.
    const existingSale = await this.repository.getSaleForDeal(input.dealId);
    if (existingSale) {
      return failSale({ code: "DUPLICATE_SALE", message: "This deal already has a sale." });
    }

    // Section 4 — customer and vehicle are always derived from the
    // deal, never accepted from the client. There is no customerId or
    // vehicleId field on CreateSaleInput at all, so "another
    // customer"/"another vehicle" isn't a case that needs checking —
    // it's structurally impossible, the same way Deal's own
    // customerId derivation from Lead works.
    if (deal.vehicleId) {
      const vehicle = await this.vehicleRepository.getById(deal.vehicleId);
      if (!vehicle || vehicle.status !== "sold") {
        return failSale({
          code: "VEHICLE_NOT_FINALIZED",
          message:
            "This deal's vehicle isn't marked sold yet, so a sale can't be finalized for it. This shouldn't normally happen — please check the deal's status.",
        });
      }
    }

    const saleAmount = input.saleAmount ?? deal.agreedPrice;
    if (!Number.isFinite(saleAmount) || !Number.isInteger(saleAmount) || saleAmount < 0) {
      return failSale({
        code: "VALIDATION_ERROR",
        message: "Sale amount must be a positive whole number.",
        fieldErrors: { saleAmount: "Must be a positive whole number." },
      });
    }

    try {
      const sale = await this.repository.createSale({
        dealId: deal.id,
        customerId: deal.customerId,
        vehicleId: deal.vehicleId,
        vehicleLabel: deal.vehicleLabel,
        saleAmount,
        notes: input.notes ?? "",
      });
      return okSale(sale);
    } catch (error) {
      if (error instanceof DuplicateSaleError) {
        return failSale({ code: "DUPLICATE_SALE", message: "This deal already has a sale." });
      }
      if (error instanceof VehicleAlreadySoldError) {
        return failSale({
          code: "VEHICLE_ALREADY_SOLD",
          message: "This vehicle already has a completed sale from a different deal.",
        });
      }
      return failSale({ code: "REPOSITORY_ERROR", message: "Could not create the sale. Please try again." });
    }
  }

  async getSale(id: string): Promise<SaleResult<Sale>> {
    const sale = await this.repository.getSaleById(id);
    if (!sale) {
      return failSale({ code: "NOT_FOUND", message: `Sale "${id}" was not found.` });
    }
    return okSale(sale);
  }

  async listSales(filter?: SaleFilter): Promise<Sale[]> {
    return this.repository.getSales(filter);
  }

  async listSalesPaged(query: SaleQuery): Promise<PaginatedSaleResult<Sale>> {
    const { page, pageSize } = normalizeSalePagination(query);
    return this.repository.getSalesPaged({ ...query, page, pageSize });
  }

  async getSaleForDeal(dealId: string): Promise<Sale | null> {
    return this.repository.getSaleForDeal(dealId);
  }

  async getSalesForCustomer(customerId: string): Promise<Sale[]> {
    return this.repository.getSalesForCustomer(customerId);
  }

  async getSalesForVehicle(vehicleId: string): Promise<Sale[]> {
    return this.repository.getSalesForVehicle(vehicleId);
  }
}

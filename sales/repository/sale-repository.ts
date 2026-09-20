import type { Sale } from "../domain/sale";
import type { SaleFilter, SaleQuery, PaginatedSaleResult } from "../domain/sale-query";

/**
 * Repository-level create shape — every field already resolved by
 * SaleService (customer/vehicle derived from the deal, vehicleLabel
 * snapshot copied, saleAmount defaulted) — mirrors
 * DealRepository.CreateDealRecord's rationale exactly.
 */
export type CreateSaleRecord = {
  dealId: string;
  customerId: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  saleAmount: number;
  notes?: string;
};

export interface SaleRepository {
  createSale(input: CreateSaleRecord): Promise<Sale>;
  getSaleById(id: string): Promise<Sale | null>;
  getSales(filter?: SaleFilter): Promise<Sale[]>;
  getSalesPaged(query: SaleQuery): Promise<PaginatedSaleResult<Sale>>;
  getSaleForDeal(dealId: string): Promise<Sale | null>;
  getSalesForCustomer(customerId: string): Promise<Sale[]>;
  getSalesForVehicle(vehicleId: string): Promise<Sale[]>;
}

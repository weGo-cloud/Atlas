import { DatabaseVehicleRepository } from "../../inventory/repository/database-vehicle-repository";
import { DatabaseDealRepository } from "../../deals/repository/database-deal-repository";
import { DatabaseSaleRepository } from "../repository/database-sale-repository";
import { SaleService } from "./sale-service";

/** Mission 019 — same rationale as getDealService: every repository below is scoped to the same businessId, so SaleService's "deal must exist"/"vehicle must exist" checks automatically become cross-business isolation checks for free. */
export function getSaleService(businessId: string): SaleService {
  return new SaleService(
    new DatabaseSaleRepository(businessId),
    new DatabaseDealRepository(businessId),
    new DatabaseVehicleRepository(businessId)
  );
}

export { SaleService };

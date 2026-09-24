import { DatabaseBusinessRepository } from "../../auth/repository/database-business-repository";
import { getEntitlementService } from "../../entitlements/service";
import { ConversionService } from "./conversion-service";

export function getConversionService(): ConversionService {
  return new ConversionService(new DatabaseBusinessRepository(), getEntitlementService());
}

export { ConversionService };

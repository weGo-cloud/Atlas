import { DatabaseCustomerRepository } from "../repository/database-customer-repository";
import { CustomerService } from "./customer-service";

/** Mission 012 — see inventory/service/index.ts for the factory-vs-singleton rationale. */
export function getCustomerService(businessId: string): CustomerService {
  return new CustomerService(new DatabaseCustomerRepository(businessId));
}

export { CustomerService };

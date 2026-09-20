import type { Customer } from "../domain/customer";
import type { CreateCustomerInput, UpdateCustomerInput } from "../domain/customer-input";
import type { CustomerQuery, PaginatedResult } from "../domain/customer-query";

export interface CustomerRepository {
  getCustomers(query: CustomerQuery): Promise<PaginatedResult<Customer>>;
  getCustomerById(id: string): Promise<Customer | null>;
  /** Batched lookup for multiple ids in one query — avoids N+1 when resolving lead→customer references. */
  getCustomersByIds(ids: string[]): Promise<Customer[]>;
  createCustomer(input: CreateCustomerInput): Promise<Customer>;
  /** Returns null when no customer exists with the given id. */
  updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer | null>;
  /** Total customer count — a single aggregate query, for dashboard use. */
  countCustomers(): Promise<number>;
}

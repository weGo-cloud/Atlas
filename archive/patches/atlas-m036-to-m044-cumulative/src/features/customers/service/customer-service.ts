import type { Customer } from "../domain/customer";
import type { CreateCustomerInput, UpdateCustomerInput } from "../domain/customer-input";
import { failCustomer, okCustomer, type CustomerResult } from "../domain/errors";
import type { CustomerQuery, PaginatedResult } from "../domain/customer-query";
import { normalizePagination } from "../domain/customer-query";
import {
  validateCreateCustomerInput,
  validateUpdateCustomerInput,
} from "../domain/validate-customer-input";
import type { CustomerRepository } from "../repository/customer-repository";

export class CustomerService {
  constructor(private readonly repository: CustomerRepository) {}

  async listCustomers(query: CustomerQuery): Promise<PaginatedResult<Customer>> {
    const { page, pageSize } = normalizePagination(query);
    return this.repository.getCustomers({ ...query, page, pageSize });
  }

  async countCustomers(): Promise<number> {
    return this.repository.countCustomers();
  }

  async getCustomer(id: string): Promise<CustomerResult<Customer>> {
    const customer = await this.repository.getCustomerById(id);
    if (!customer) {
      return failCustomer({
        code: "NOT_FOUND",
        message: `Customer "${id}" was not found.`,
      });
    }
    return okCustomer(customer);
  }

  /** Batched lookup for multiple ids in one query — avoids N+1 when resolving lead→customer references. */
  async getCustomersByIds(ids: string[]): Promise<Customer[]> {
    return this.repository.getCustomersByIds(ids);
  }

  async createCustomer(
    input: CreateCustomerInput
  ): Promise<CustomerResult<Customer>> {
    const fieldErrors = validateCreateCustomerInput(input);
    if (Object.keys(fieldErrors).length > 0) {
      return failCustomer({
        code: "VALIDATION_ERROR",
        message: "Customer data is invalid.",
        fieldErrors,
      });
    }

    try {
      const customer = await this.repository.createCustomer(input);
      return okCustomer(customer);
    } catch {
      return failCustomer({
        code: "REPOSITORY_ERROR",
        message: "Could not create the customer. Please try again.",
      });
    }
  }

  async updateCustomer(
    id: string,
    input: UpdateCustomerInput
  ): Promise<CustomerResult<Customer>> {
    const existing = await this.repository.getCustomerById(id);
    if (!existing) {
      return failCustomer({
        code: "NOT_FOUND",
        message: `Customer "${id}" was not found.`,
      });
    }

    const fieldErrors = validateUpdateCustomerInput(input, existing);
    if (Object.keys(fieldErrors).length > 0) {
      return failCustomer({
        code: "VALIDATION_ERROR",
        message: "Customer data is invalid.",
        fieldErrors,
      });
    }

    try {
      const customer = await this.repository.updateCustomer(id, input);
      if (!customer) {
        return failCustomer({
          code: "NOT_FOUND",
          message: `Customer "${id}" was not found.`,
        });
      }
      return okCustomer(customer);
    } catch {
      return failCustomer({
        code: "REPOSITORY_ERROR",
        message: "Could not update the customer. Please try again.",
      });
    }
  }
}

"use server";

import { revalidatePath } from "next/cache";

import { getCustomerService } from "../service";
import type { Customer } from "../domain/customer";
import type { CustomerServiceError } from "../domain/errors";
import type { CreateCustomerInput, UpdateCustomerInput } from "../domain/customer-input";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export type CustomerActionResult =
  | { ok: true; customer: Customer }
  | { ok: false; error: CustomerServiceError };

function revalidateCustomerPaths(customerId: string) {
  revalidatePath("/app/customers");
  revalidatePath(`/app/customers/${customerId}`);
  // Dashboard shows a total-customers count.
  revalidatePath("/app/dashboard");
  revalidatePath("/app/analytics");
}

export async function createCustomerAction(
  input: CreateCustomerInput
): Promise<CustomerActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getCustomerService(business.id).createCustomer(input);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateCustomerPaths(result.data.id);
  return { ok: true, customer: result.data };
}

export async function updateCustomerAction(
  id: string,
  input: UpdateCustomerInput
): Promise<CustomerActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getCustomerService(business.id).updateCustomer(id, input);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateCustomerPaths(result.data.id);
  return { ok: true, customer: result.data };
}

/**
 * Read-only lookup for the "select existing customer" picker used
 * when creating a lead from a vehicle. Kept intentionally small — a
 * handful of best matches, not a paginated result — since it backs a
 * quick-pick dropdown, not the full customer list page.
 */
export async function searchCustomersAction(query: string): Promise<Customer[]> {
  if (!query.trim()) return [];
  const { business } = await requireCurrentSession();
  const result = await getCustomerService(business.id).listCustomers({
    search: query,
    page: 1,
    pageSize: 8,
  });
  return result.items;
}

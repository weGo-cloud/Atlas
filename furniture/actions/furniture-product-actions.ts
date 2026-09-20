"use server";

import { revalidatePath } from "next/cache";

import { getFurnitureProductService } from "../service";
import type { FurnitureProduct, FurnitureStatus } from "../domain/furniture-product";
import type { FurnitureServiceError } from "../domain/errors";
import type { DeleteFurnitureProductOutcome } from "../service/furniture-product-service";
import type { CreateFurnitureProductInput } from "../domain/furniture-product-input";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { ForbiddenError, requirePermission } from "@/features/auth/domain/permissions";
import { getEntitlementService } from "@/features/entitlements/service";

export type FurnitureProductActionResult =
  | { ok: true; product: FurnitureProduct }
  | { ok: false; error: FurnitureServiceError };

export type DeleteFurnitureProductActionResult =
  | { ok: true; outcome: DeleteFurnitureProductOutcome }
  | { ok: false; error: FurnitureServiceError };

function revalidateFurniturePaths(productId: string) {
  revalidatePath("/app/inventory");
  revalidatePath(`/app/inventory/${productId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/analytics");
}

/**
 * Mission 030 — same "server action → resolve session → entitlement
 * gate → transactional create" flow as createVehicleAction (Mission
 * 029, Section 14), applied to the "furniture_products" limit key
 * instead of "vehicles". See resolveLimitGate/createWithinLimit's doc
 * comments for why the gate is resolved before, and enforced inside,
 * a single database transaction.
 */
export async function createFurnitureProductAction(
  input: CreateFurnitureProductInput
): Promise<FurnitureProductActionResult> {
  const { business } = await requireCurrentSession();

  const furnitureService = getFurnitureProductService(business.id);
  const limitGate = await getEntitlementService().resolveLimitGate(business.id, "furniture_products");
  if (!limitGate.ok) {
    return {
      ok: false,
      error: { code: "LIMIT_EXCEEDED", message: "Your subscription is not active — contact your account owner." },
    };
  }

  const result = await furnitureService.createProductWithinLimit(input, limitGate.limit);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFurniturePaths(result.data.id);
  return { ok: true, product: result.data };
}

export async function updateFurnitureProductAction(
  id: string,
  input: CreateFurnitureProductInput
): Promise<FurnitureProductActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getFurnitureProductService(business.id).updateProduct(id, input);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFurniturePaths(result.data.id);
  return { ok: true, product: result.data };
}

export async function updateFurnitureProductStatusAction(
  id: string,
  targetStatus: FurnitureStatus
): Promise<FurnitureProductActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getFurnitureProductService(business.id).updateProductStatus(id, targetStatus);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFurniturePaths(result.data.id);
  return { ok: true, product: result.data };
}

/** Deletes a furniture product (and, best-effort, its stored photo files). Owner-only, same rationale as deleteVehicleAction. */
export async function deleteFurnitureProductAction(id: string): Promise<DeleteFurnitureProductActionResult> {
  const session = await requireCurrentSession();

  try {
    requirePermission(session, "furniture_product.delete");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: { code: "FORBIDDEN", message: error.message } };
    }
    throw error;
  }

  const { business } = session;
  const result = await getFurnitureProductService(business.id).deleteProduct(id);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFurniturePaths(id);
  return { ok: true, outcome: result.data };
}

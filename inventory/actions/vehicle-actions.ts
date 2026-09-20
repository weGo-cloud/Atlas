"use server";

import { revalidatePath } from "next/cache";

import { getVehicleService } from "../service";
import type { Vehicle, VehicleStatus } from "../data/types";
import type { VehicleServiceError } from "../domain/errors";
import type { DeleteVehicleOutcome } from "../service/vehicle-service";
import type { VehicleFormValues } from "../lib/vehicle-form-schema";
import { toCreateVehicleInput } from "../lib/vehicle-form-schema";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { ForbiddenError, requirePermission } from "@/features/auth/domain/permissions";
import { getEntitlementService } from "@/features/entitlements/service";

export type VehicleActionResult =
  | { ok: true; vehicle: Vehicle }
  | { ok: false; error: VehicleServiceError };

export type DeleteVehicleActionResult =
  | { ok: true; outcome: DeleteVehicleOutcome }
  | { ok: false; error: VehicleServiceError };

/** Mission 015 — lightweight vehicle picker for the lead-creation dialog when it isn't opened from a specific vehicle's page. Mirrors searchCustomersAction's shape/limits. */
export async function searchVehiclesAction(query: string): Promise<Vehicle[]> {
  if (!query.trim()) return [];
  const { business } = await requireCurrentSession();
  const result = await getVehicleService(business.id).listVehiclesPaged({
    search: query,
    page: 1,
    pageSize: 8,
  });
  return result.items;
}

function revalidateVehiclePaths(vehicleId: string) {
  revalidatePath("/app/inventory");
  revalidatePath(`/app/inventory/${vehicleId}`);
  // Dashboard summary/breakdown/recent-inventory data is derived from
  // the same vehicles table and has no dynamic APIs of its own, so it
  // gets statically cached like the inventory list did before Mission
  // 008 — bust it on every mutation so operators never see stale
  // counts/value/breakdowns after a create, edit, status change, or
  // delete.
  revalidatePath("/app/dashboard");
  revalidatePath("/app/analytics");
}

export async function createVehicleAction(
  values: VehicleFormValues
): Promise<VehicleActionResult> {
  // Defense in depth alongside middleware/layout — a mutating action
  // re-derives the business context itself rather than trusting that
  // the request already passed through a protected page render.
  const { business } = await requireCurrentSession();

  // Mission 028, Section 7/9 / Mission 029, Section 14 — server-side
  // enforcement of the plan's "vehicles" usage limit, still checked
  // here in the action layer rather than inside VehicleService (same
  // "UI → server action → authorization → entitlement check → domain
  // operation" flow, keeping VehicleService free of any
  // commercial-platform concern). Mission 029 changed *how* the limit
  // is enforced: resolveLimitGate resolves the plan's numeric cap
  // without needing a current count, and VehicleService.createVehicleWithinLimit
  // does the count-check-and-insert inside one database transaction —
  // closing a real check-then-insert race the old two-step
  // countByStatus()-then-checkLimit() sequence had (see
  // DatabaseVehicleRepository.createWithinLimit's doc comment).
  const vehicleService = getVehicleService(business.id);
  const limitGate = await getEntitlementService().resolveLimitGate(business.id, "vehicles");
  if (!limitGate.ok) {
    return {
      ok: false,
      error: {
        code: "LIMIT_EXCEEDED",
        message: "Your subscription is not active — contact your account owner.",
      },
    };
  }

  const result = await vehicleService.createVehicleWithinLimit(
    toCreateVehicleInput(values),
    limitGate.limit
  );

  if (!result.ok) return { ok: false, error: result.error };

  // The inventory list route has no dynamic APIs, so Next serves it from
  // the static route cache — without this, a newly created vehicle
  // wouldn't appear until the cache expired on its own.
  revalidateVehiclePaths(result.data.id);

  return { ok: true, vehicle: result.data };
}

export async function updateVehicleAction(
  id: string,
  values: VehicleFormValues
): Promise<VehicleActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getVehicleService(business.id).updateVehicle(
    id,
    toCreateVehicleInput(values)
  );

  if (!result.ok) return { ok: false, error: result.error };

  revalidateVehiclePaths(result.data.id);

  return { ok: true, vehicle: result.data };
}

/**
 * Applies a status transition. Never called directly from a client
 * component's state — this is the only path status changes go
 * through, and the actual transition rules live in
 * VehicleService.updateVehicleStatus (domain/vehicle-status.ts).
 */
export async function updateVehicleStatusAction(
  id: string,
  targetStatus: VehicleStatus
): Promise<VehicleActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getVehicleService(business.id).updateVehicleStatus(
    id,
    targetStatus
  );

  if (!result.ok) return { ok: false, error: result.error };

  revalidateVehiclePaths(result.data.id);

  return { ok: true, vehicle: result.data };
}

/**
 * Deletes a vehicle (and, best-effort, its stored photo files — see
 * VehicleService.deleteVehicle for the cleanup ordering rationale).
 */
export async function deleteVehicleAction(
  id: string
): Promise<DeleteVehicleActionResult> {
  const session = await requireCurrentSession();

  // Mission 013: destructive — owner only. requirePermission is the
  // one authoritative check (see auth/domain/permissions.ts); it
  // reads session.user.role, which requireCurrentSession() just
  // re-derived server-side from the DB-backed session, so nothing
  // client-supplied can influence this decision.
  try {
    requirePermission(session, "vehicle.delete");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: { code: "FORBIDDEN", message: error.message } };
    }
    throw error;
  }

  const { business } = session;
  const result = await getVehicleService(business.id).deleteVehicle(id);

  if (!result.ok) return { ok: false, error: result.error };

  revalidateVehiclePaths(id);

  return { ok: true, outcome: result.data };
}

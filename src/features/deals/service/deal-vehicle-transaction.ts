import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { deals, vehicles } from "@/lib/db/schema";
import { canTransitionStatus } from "../../inventory/domain/vehicle-status";
import type { VehicleStatus } from "../../inventory/data/types";
import type { Deal, DealStatus } from "../domain/deal";
import { toDeal } from "../repository/database-deal-repository";

export type DealVehicleTransitionOutcome =
  | { ok: true; deal: Deal }
  /** The deal's status no longer matches `expectedFrom` — either it doesn't exist/isn't ours, or a concurrent transition already won. */
  | { ok: false; reason: "STALE_STATUS" }
  /** `deal.vehicleId` is set but no vehicle row exists for it in this business — defensive; shouldn't happen given `vehicleId`'s `ON DELETE SET NULL`. */
  | { ok: false; reason: "VEHICLE_NOT_FOUND" }
  /** The vehicle can't make the transition this deal status change requires (already reserved/sold under another deal, or in some other incompatible state). */
  | { ok: false; reason: "VEHICLE_UNAVAILABLE" };

/**
 * Mission 018.1 — the required vehicle-side effect for a given Deal
 * status transition, or null when the transition has none. Mirrors
 * the mapping DealService.updateDealStatus used to apply as two
 * separate statements (Mission 018); it's reproduced here, not
 * imported from there, because this function needs to run entirely
 * *inside* a single synchronous database transaction (see below) —
 * pulling in DealService or VehicleService here would reintroduce
 * the two-statement gap this mission exists to close.
 */
function requiredVehicleStatusFor(from: DealStatus, to: DealStatus): VehicleStatus | null {
  if (to === "reserved") return "reserved";
  if (to === "completed") return "sold";
  if (from === "reserved" && (to === "negotiating" || to === "cancelled")) return "available";
  return null;
}

/**
 * Applies a Deal status transition and its required Vehicle status
 * side effect (if any) as ONE atomic database transaction, closing
 * the race Mission 018 left as a documented, accepted limitation:
 * previously, the vehicle mutation (via VehicleService) and the
 * deal's own atomic status UPDATE (via DealRepository) were two
 * separate statements — a concurrent caller could observe (or even
 * produce) a vehicle mutated with no matching deal transition, or
 * vice versa.
 *
 * Implementation note — why this bypasses DealRepository/
 * VehicleRepository/VehicleService rather than composing them: this
 * project's SQLite driver (better-sqlite3, via
 * `drizzle-orm/better-sqlite3`) implements `db.transaction()`
 * synchronously — it wraps a single, *synchronous* JS callback in a
 * native BEGIN/COMMIT/ROLLBACK. Calling `await` inside that callback
 * would let the Node.js event loop interleave other concurrent
 * requests' queries into the still-open transaction (they all share
 * one connection), silently breaking isolation. Every repository
 * method in this codebase is `async` (correctly so — it's the right
 * default outside a transaction), so composing them here isn't safe;
 * this function instead issues the same drizzle queries directly,
 * called synchronously (`.get()`/`.run()`, no `await`) against the
 * transaction's own `tx` handle. See MISSION_018_1_REPORT.md, section
 * 5, for the verification that confirmed this behavior.
 *
 * Every check that can reject the transition (stale deal status,
 * missing vehicle, an incompatible vehicle status) happens *before*
 * any row is written, and the function returns a plain failure value
 * rather than throwing for those cases — no mutation has occurred at
 * that point, so returning is equivalent to a rollback. If a
 * genuinely unexpected error occurs, it propagates as a thrown error,
 * which better-sqlite3's transaction wrapper always resolves as a
 * ROLLBACK, so no partial Deal/Vehicle state can persist either way.
 */
export function applyDealStatusTransitionAtomically(
  businessId: string,
  dealId: string,
  expectedFrom: DealStatus,
  to: DealStatus
): DealVehicleTransitionOutcome {
  return db.transaction((tx) => {
    const dealRow = tx
      .select()
      .from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.businessId, businessId), eq(deals.status, expectedFrom)))
      .get();

    if (!dealRow) {
      return { ok: false, reason: "STALE_STATUS" } as const;
    }

    const now = new Date().toISOString();
    const requiredVehicleStatus = dealRow.vehicleId ? requiredVehicleStatusFor(expectedFrom, to) : null;

    if (requiredVehicleStatus && dealRow.vehicleId) {
      const vehicleRow = tx
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, dealRow.vehicleId), eq(vehicles.businessId, businessId)))
        .get();

      if (!vehicleRow) {
        return { ok: false, reason: "VEHICLE_NOT_FOUND" } as const;
      }

      const currentVehicleStatus = vehicleRow.status as VehicleStatus;

      if (requiredVehicleStatus === "available") {
        // Best-effort release, same as Mission 018: only mutate if the
        // vehicle is still reserved (presumably by this very deal);
        // if it isn't, there's nothing to release and that's not a
        // failure. Guarded by canTransitionStatus for correctness,
        // but reserved -> available is always allowed, so this never
        // actually rejects — it only ever chooses "mutate" or
        // "nothing to do".
        if (canTransitionStatus(currentVehicleStatus, "available")) {
          tx.update(vehicles).set({ status: "available", updatedAt: now }).where(eq(vehicles.id, vehicleRow.id)).run();
        }
      } else {
        // "reserved" or "sold" — both are hard requirements. Mission
        // 018.1, Section 3: a Deal must not become completed merely
        // because its vehicle is already sold — canTransitionStatus
        // rejects a same-status "transition" (sold -> sold), so an
        // already-sold vehicle correctly fails this check rather than
        // being silently treated as already-satisfied.
        if (!canTransitionStatus(currentVehicleStatus, requiredVehicleStatus)) {
          return { ok: false, reason: "VEHICLE_UNAVAILABLE" } as const;
        }
        tx.update(vehicles)
          .set({ status: requiredVehicleStatus, updatedAt: now })
          .where(eq(vehicles.id, vehicleRow.id))
          .run();
      }
    }

    tx.update(deals).set({ status: to, updatedAt: now }).where(eq(deals.id, dealId)).run();

    const updatedRow = tx.select().from(deals).where(eq(deals.id, dealId)).get();
    if (!updatedRow) {
      throw new Error("Deal row vanished mid-transaction — this should be unreachable.");
    }

    return { ok: true, deal: toDeal(updatedRow) } as const;
  });
}

import type { VehicleStatus } from "../data/types";

/**
 * Explicit allowed-transition table. A status is never allowed to
 * transition to itself (setting "reserved" on an already-reserved
 * vehicle is rejected as a no-op, not silently accepted), and
 * sold → reserved is deliberately excluded — a sold vehicle can only
 * be returned to available, never re-reserved directly.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  available: ["reserved", "sold"],
  reserved: ["available", "sold"],
  sold: ["available"],
};

export function canTransitionStatus(
  from: VehicleStatus,
  to: VehicleStatus
): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

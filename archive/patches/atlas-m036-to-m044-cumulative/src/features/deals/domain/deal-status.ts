import type { DealStatus } from "./deal";

/**
 * Mission 018. Unlike Lead status (deliberately permissive — see
 * lead-status.ts), Deal status uses an explicit allowed-transition
 * table, the same style as vehicle-status.ts. A Deal represents real
 * money and a real vehicle reservation, so its state machine is
 * stricter on purpose:
 *
 * - `draft` → `negotiating` or `cancelled`.
 * - `negotiating` → `draft` (terms fell apart, back to square one),
 *   `reserved`, or `cancelled`.
 * - `reserved` → `negotiating` (the customer backs off the hold but
 *   the deal is still alive), `completed`, or `cancelled`.
 * - `completed` and `cancelled` are both fully terminal — neither can
 *   be exited once reached. This is intentionally stricter than
 *   Lead's terminal-state handling (which allows reopening a
 *   terminal Lead back to active): Deal completion/cancellation is
 *   tied to a real side effect on the vehicle's own status (sold /
 *   released back to available — see DealService), and "reopening" a
 *   completed or cancelled Deal would require unwinding that side
 *   effect too, which is exactly the ownership-transfer/Sale-layer
 *   work Mission 018 explicitly defers (Section 18). A genuinely
 *   reopened transaction is a new Deal against the same Lead, which
 *   the domain already supports once the terminal one no longer
 *   counts as "active" (see the partial unique index in schema.ts).
 *
 * A same-status update (a no-op) is always rejected.
 */
export const ALLOWED_DEAL_STATUS_TRANSITIONS: Record<DealStatus, DealStatus[]> = {
  draft: ["negotiating", "cancelled"],
  negotiating: ["draft", "reserved", "cancelled"],
  reserved: ["negotiating", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionDealStatus(from: DealStatus, to: DealStatus): boolean {
  return ALLOWED_DEAL_STATUS_TRANSITIONS[from].includes(to);
}

import { isLeadStatusTerminal, type LeadStatus } from "./lead";

/**
 * Mission 015. Unlike vehicle status (Mission 008), which blocks one
 * specific transition (sold → reserved) to model a real business
 * constraint, lead status stays deliberately permissive for almost
 * every case: the original design intent is explicit that "the system
 * should not make irreversible assumptions about real-world sales
 * processes" and staff must be able to correct a status (reopen a
 * lead marked "lost" by mistake, revert a premature "won", jump
 * straight from "new" to "won" for a walk-in who buys on the spot,
 * move backward from "negotiating" to "contacted" if a deal stalls,
 * etc.). Mission 015 preserves all of that.
 *
 * The one new restriction: moving directly between the two terminal
 * states ("won" → "lost" or "lost" → "won") is rejected. Every other
 * transition — active→active, active→terminal, terminal→active — is
 * allowed. This isn't arbitrary: "won" and "lost" are opposite facts
 * about the same opportunity, and a future Deal/Sale mission may treat
 * reaching "won" as a meaningful trigger. Flipping straight from one
 * terminal fact to the other, with no reconsideration step, is the one
 * case genuinely worth blocking; reopening first (won/lost → active)
 * and then re-terminalizing is still one extra click away, not blocked.
 *
 * A same-status update (a no-op) is rejected either way.
 */
export function canTransitionLeadStatus(
  from: LeadStatus,
  to: LeadStatus
): boolean {
  if (from === to) return false;
  if (isLeadStatusTerminal(from) && isLeadStatusTerminal(to)) return false;
  return true;
}

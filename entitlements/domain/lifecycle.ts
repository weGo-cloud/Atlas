import type { SubscriptionStatus } from "./subscription";

/**
 * Mission 029, Section 5 — the formalized set of status transitions
 * the subscription lifecycle allows. Mirrors `canTransitionStatus`
 * (inventory/domain/vehicle-status.ts)'s shape exactly: a small
 * from→to whitelist, not a general state-machine library, so the
 * rules stay legible in one place instead of scattered `if (status
 * === ...)` checks across services and actions (Section 13's
 * "centralized ... policy" instruction, applied to status transitions
 * rather than access levels).
 *
 * Deliberately conservative about what's reachable without a real
 * billing provider:
 * - "trialing" only ever resolves forward (to active once payment
 *   intent is confirmed, later) or terminally (cancelled/expired) —
 *   it never jumps straight to paused/past_due, since both of those
 *   presuppose a billing cycle that hasn't started yet.
 * - "past_due" and "paused" are reachable only from "active" (you can
 *   only fall behind on, or pause, a subscription that was actually
 *   running) and can return to "active" (the conventional "payment
 *   recovered" / "unpaused" path) or terminate.
 * - "cancelled" and "expired" can both reactivate to "active" — this
 *   is the self-serve "resubscribe" path Section 16 asks for, and
 *   also covers "cancel at period end" being undone by `resume`
 *   before the period actually elapses (see
 *   SubscriptionLifecycleService.resume).
 */
const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, ReadonlySet<SubscriptionStatus>> = {
  trialing: new Set(["active", "cancelled", "expired"]),
  active: new Set(["past_due", "paused", "cancelled", "expired"]),
  past_due: new Set(["active", "paused", "cancelled", "expired"]),
  paused: new Set(["active", "cancelled", "expired"]),
  cancelled: new Set(["active"]),
  expired: new Set(["active"]),
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  if (from === to) return true; // idempotent no-op retry — see Section 10.
  return ALLOWED_TRANSITIONS[from].has(to);
}

export class InvalidSubscriptionTransitionError extends Error {
  constructor(
    public readonly from: SubscriptionStatus,
    public readonly to: SubscriptionStatus
  ) {
    super(`Cannot transition subscription from "${from}" to "${to}".`);
    this.name = "InvalidSubscriptionTransitionError";
  }
}

/** Throws InvalidSubscriptionTransitionError if the transition isn't allowed; otherwise a no-op. Every SubscriptionLifecycleService mutation calls this before writing. */
export function assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidSubscriptionTransitionError(from, to);
  }
}

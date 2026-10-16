import type { SubscriptionPlan } from "./plan";

/** The free tier every business falls back to (kept as a literal here so this module has no runtime dependency on the plan catalog). */
const FALLBACK_PLAN: SubscriptionPlan = "starter";

/**
 * Mission 028, Section 10 — states that make sense for the current
 * architecture (no payment provider is connected — Section 21 — so
 * there is no gateway pushing status transitions yet; these exist so
 * the domain can represent them once one is).
 *
 * - "trialing" / "active": subscription grants its plan's capabilities.
 * - "past_due": billing has failed but the business keeps access for
 *   a grace period — this is the one status distinction Section 10's
 *   "grace periods" note asks the domain to be able to represent; no
 *   grace-period *duration* logic is implemented (there's no billing
 *   event to start a grace period from yet), only the fact that
 *   past_due itself still grants access rather than cutting it off
 *   immediately, which is the conventional SaaS behavior.
 * - "paused" / "cancelled" / "expired": do not grant paid capabilities.
 */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "cancelled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["trialing", "active", "past_due"]);

/** Whether a subscription in this status grants its plan's capabilities at all (a status check, not a capability/limit check — see access.ts for the full decision). */
export function statusGrantsAccess(status: SubscriptionStatus): boolean {
  return ENTITLED_STATUSES.has(status);
}

/**
 * Mission 028 — the "organization subscription" concept Section 10
 * asks to be kept distinct from both the plan *definition* (plan.ts,
 * code-defined) and any future payment *transaction* (not modeled at
 * all yet — Section 21). One row per business in the `subscriptions`
 * table (repository/subscription-repository.ts).
 */
export type Subscription = {
  id: string;
  businessId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /**
   * Mission 028, Section 15 — the billing boundary. All four fields
   * below are null until a real provider is connected (a future
   * mission); nothing in this one reads or writes them yet. They
   * exist purely so a future BillingAdapter has somewhere to persist
   * its own state without another schema change.
   */
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Mission 029, Section 11 — "trial expiration must be deterministic.
 * Do not use hidden `new Date()` calls deep inside domain logic. Pass
 * time/context explicitly." — the same discipline M026/M027's
 * predictive-intelligence rules already follow for `now`.
 *
 * A pure projection, not a mutation: given a subscription row and an
 * explicit `now`, what status *should* currently be in effect? This
 * lets every reader (EntitlementService included) see a
 * trial-expired subscription as expired the instant `now` passes
 * `trialEndsAt`, without depending on a cron job having already
 * flipped the stored row. SubscriptionLifecycleService.reconcileElapsed
 * is the explicit, separate operation that persists this projection
 * back to the `subscriptions` table (Section 11 asks for
 * deterministic *evaluation*; persisting it is a distinct concern —
 * see that service's doc comment).
 *
 * Only trial expiry and "cancel at period end" are projected here —
 * every other transition (past_due, paused, ...) requires an actual
 * external signal (a failed charge, an owner action) that nothing in
 * Atlas can infer from the clock alone, so effective status equals
 * stored status for those.
 */
export function resolveEffectiveStatus(subscription: Subscription, now: Date): SubscriptionStatus {
  if (subscription.status === "trialing" && subscription.trialEndsAt !== null) {
    if (new Date(subscription.trialEndsAt).getTime() <= now.getTime()) {
      return "expired";
    }
  }
  if (
    subscription.cancelAtPeriodEnd &&
    (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due") &&
    subscription.currentPeriodEnd !== null &&
    new Date(subscription.currentPeriodEnd).getTime() <= now.getTime()
  ) {
    return "cancelled";
  }
  return subscription.status;
}

/** True while `now` is still within the subscription's trial window — used to decide whether "resume"/"cancel" wording should say "trial" in the UI (Mission 029, Section 16). */
export function isTrialActive(subscription: Subscription, now: Date): boolean {
  return (
    subscription.status === "trialing" &&
    subscription.trialEndsAt !== null &&
    new Date(subscription.trialEndsAt).getTime() > now.getTime()
  );
}

/**
 * Mission 036 — why a business is currently on the free fallback plan
 * rather than the plan its stored row names. `null` means no fallback
 * is in effect.
 */
export type FallbackReason = "trial_ended" | "subscription_ended";

export type EffectiveSubscription = {
  /** The subscription as it should be treated *right now* — plan and status already resolved against `now`. Every access/limit decision uses this, never the stored row. */
  subscription: Subscription;
  /** Set when the stored plan/status was replaced by the free Starter fallback. */
  fallback: FallbackReason | null;
};

/**
 * Mission 036 — "after the trial, fall back to Starter, never lock
 * the business out."
 *
 * Builds on `resolveEffectiveStatus` (still the single place trial
 * expiry and cancel-at-period-end are evaluated): when the effective
 * status is `expired` or `cancelled`, the business is treated as an
 * `active` Starter subscription. `paused` and `past_due` are
 * unchanged — those need an external signal and keep their existing
 * meaning (paused is still locked, past_due still grants access).
 *
 * A pure projection with `now` passed explicitly, exactly like
 * `resolveEffectiveStatus`: no cron job is needed for this to take
 * effect the instant a trial elapses, and nothing is written. The
 * stored row keeps its honest `expired`/`cancelled` status as history;
 * `SubscriptionLifecycleService.changePlan` is still the only way
 * back to a paid plan. Existing data is never touched (M029 Section
 * 6's no-data-loss rule) — only what new capability and limit checks
 * return changes.
 */
export function resolveEffectiveSubscription(subscription: Subscription, now: Date): EffectiveSubscription {
  const status = resolveEffectiveStatus(subscription, now);
  if (status === "expired" || status === "cancelled") {
    // A subscription that still carries a trial end date never converted to a paid plan (changePlan clears it when a plan is chosen), so its fallback is the trial ending rather than a paid plan lapsing.
    const fallback: FallbackReason = subscription.trialEndsAt !== null ? "trial_ended" : "subscription_ended";
    return { subscription: { ...subscription, plan: FALLBACK_PLAN, status: "active" }, fallback };
  }
  return { subscription: status === subscription.status ? subscription : { ...subscription, status }, fallback: null };
}

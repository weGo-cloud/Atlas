import { isPlanAssignable, type SubscriptionPlan } from "../domain/plan";
import { assertTransition } from "../domain/lifecycle";
import { resolveEffectiveStatus, type Subscription } from "../domain/subscription";
import type { SubscriptionRepository, UpdateSubscriptionInput } from "../repository/subscription-repository";

export class NoSubscriptionError extends Error {
  constructor(public readonly businessId: string) {
    super(`Business "${businessId}" has no subscription.`);
    this.name = "NoSubscriptionError";
  }
}

export class PlanNotAssignableError extends Error {
  constructor(public readonly plan: SubscriptionPlan) {
    super(`Plan "${plan}" is not currently assignable.`);
    this.name = "PlanNotAssignableError";
  }
}

/**
 * Mission 029 — the server-authoritative surface for every
 * subscription-state change (Section 5: "these operations must be
 * server-authoritative. Do not let the browser directly modify
 * subscription state."). Every public method here resolves the
 * current row, validates the transition through
 * domain/lifecycle.ts's whitelist, and persists through
 * SubscriptionRepository — the same "thin service, pure domain
 * decision, repository write" shape EntitlementService already uses
 * for reads.
 *
 * Section 2's "commercial intent vs. actual payment confirmation"
 * distinction: every operation below represents *intent* (an
 * owner/admin choosing a plan, choosing to cancel) recorded directly.
 * None of them contact BillingProvider (billing/billing-provider.ts)
 * or fabricate a payment result — a future mission that wires a real
 * provider would call out to it from `changePlan`/`cancel` and only
 * persist the *provider's* returned status, never assume success
 * locally. Marked inline below at each such point.
 *
 * Idempotency (Section 10): `getOrCreate` re-fetches on a racing
 * unique-constraint violation instead of surfacing a duplicate error,
 * and every transition is idempotent when `to === from` (see
 * lifecycle.ts's `canTransition`) — retrying the same activation or
 * cancellation twice is safe.
 */
export class SubscriptionLifecycleService {
  constructor(private readonly repository: SubscriptionRepository) {}

  /** Idempotent subscription creation — the entry point for a brand-new business. Returns the existing row untouched if one already exists (never overwrites an in-progress trial/paid subscription just because signup ran twice). */
  async getOrCreate(businessId: string, plan: SubscriptionPlan): Promise<Subscription> {
    const existing = await this.repository.getByBusinessId(businessId);
    if (existing) return existing;

    if (!isPlanAssignable(plan)) throw new PlanNotAssignableError(plan);

    try {
      return await this.repository.create({ businessId, plan, status: "active" });
    } catch (error) {
      // The `subscriptions_business_id_unique` index (schema.ts) is the
      // real guard against a duplicate row — this re-fetch handles the
      // case where a concurrent retry of the same signup won the race.
      const racedResult = await this.repository.getByBusinessId(businessId);
      if (racedResult) return racedResult;
      throw error;
    }
  }

  /** Starts (or restarts) a trial on the given plan. `trialEndsAt` is supplied by the caller (an explicit ISO timestamp, e.g. `now + 14 days`), never computed with a hidden clock call in here — see subscription.ts's resolveEffectiveStatus doc comment for why. */
  async startTrial(businessId: string, plan: SubscriptionPlan, trialEndsAt: string): Promise<Subscription> {
    const subscription = await this.requireSubscription(businessId);
    if (!isPlanAssignable(plan)) throw new PlanNotAssignableError(plan);
    assertTransition(subscription.status, "trialing");
    return this.persist(businessId, { plan, status: "trialing", trialEndsAt, cancelAtPeriodEnd: false });
  }

  /** Marks the subscription active — the "trial converted" / "payment recovered" path. A future billing integration calls this only after BillingProvider confirms the charge, never speculatively. */
  async activate(businessId: string): Promise<Subscription> {
    const subscription = await this.requireSubscription(businessId);
    assertTransition(subscription.status, "active");
    return this.persist(businessId, { status: "active" });
  }

  /**
   * Mission 029, Section 6/22 — changes which plan is in effect.
   * Deliberately NOT a status transition (assertTransition isn't
   * called): Section 22's "Subscription → Plan → Capabilities"
   * architecture treats plan and status as orthogonal, so you can
   * change plan while past_due, for instance, without that itself
   * being a lifecycle event. The only guard is that the *target* plan
   * must currently be assignable.
   *
   * Never touches inventory data — Section 6's "downgrade does not
   * delete data" requirement is satisfied by this method simply never
   * reading or writing the `vehicles` table at all. The consequence
   * of a downgrade (existing usage now over the new limit) is
   * surfaced by EntitlementService.checkLimit on the next create
   * attempt, not enforced here.
   */
  async changePlan(businessId: string, plan: SubscriptionPlan): Promise<Subscription> {
    await this.requireSubscription(businessId);
    if (!isPlanAssignable(plan)) throw new PlanNotAssignableError(plan);
    return this.persist(businessId, { plan });
  }

  /**
   * Mission 029, Section 12 — cancellation with the
   * immediate-vs-at-period-end distinction Section 12 asks for where
   * the architecture can support it cleanly. "at_period_end" doesn't
   * change `status` yet (the subscription keeps granting access,
   * exactly like today's grace-period semantics) — it only sets the
   * flag; `reconcileElapsed` is what actually flips status to
   * "cancelled" once `currentPeriodEnd` passes, using the same
   * deterministic-clock discipline as trial expiry.
   */
  async cancel(businessId: string, mode: "immediate" | "at_period_end"): Promise<Subscription> {
    const subscription = await this.requireSubscription(businessId);
    if (mode === "immediate") {
      assertTransition(subscription.status, "cancelled");
      return this.persist(businessId, { status: "cancelled", cancelAtPeriodEnd: false });
    }
    return this.persist(businessId, { cancelAtPeriodEnd: true });
  }

  /** Undoes a pending cancel-at-period-end, or reactivates an already-cancelled/expired subscription — the self-serve "resubscribe" path (Section 16). */
  async resume(businessId: string): Promise<Subscription> {
    const subscription = await this.requireSubscription(businessId);
    if (subscription.cancelAtPeriodEnd && (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due")) {
      return this.persist(businessId, { cancelAtPeriodEnd: false });
    }
    assertTransition(subscription.status, "active");
    return this.persist(businessId, { status: "active", cancelAtPeriodEnd: false });
  }

  /**
   * Mission 029, Section 11/12 — the explicit, persisted counterpart
   * to subscription.ts's `resolveEffectiveStatus`. Deterministic
   * *evaluation* (which EntitlementService already does on every
   * read, without persisting) is a separate concern from *persisting*
   * that evaluation back to the row — this method is the one place
   * that write happens, called explicitly (e.g. when the settings
   * page loads, or by a future scheduled job) rather than from deep
   * inside a read path. A no-op (returns the row unchanged) when
   * nothing has elapsed — safe to call on every settings-page render.
   */
  async reconcileElapsed(businessId: string, now: Date): Promise<Subscription> {
    const subscription = await this.requireSubscription(businessId);
    const effective = resolveEffectiveStatus(subscription, now);
    if (effective === subscription.status) return subscription;
    const patch: UpdateSubscriptionInput =
      effective === "cancelled" ? { status: "cancelled", cancelAtPeriodEnd: false } : { status: effective };
    return this.persist(businessId, patch);
  }

  private async requireSubscription(businessId: string): Promise<Subscription> {
    const subscription = await this.repository.getByBusinessId(businessId);
    if (!subscription) throw new NoSubscriptionError(businessId);
    return subscription;
  }

  private async persist(businessId: string, patch: UpdateSubscriptionInput): Promise<Subscription> {
    const updated = await this.repository.update(businessId, patch);
    if (!updated) throw new NoSubscriptionError(businessId);
    return updated;
  }
}

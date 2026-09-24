import { limitFor, type Capability, type LimitKey } from "../domain/plan";
import { evaluateCapabilityAccess, evaluateLimit, type AccessDecision, type LimitDecision } from "../domain/access";
import { accessLevelForStatus, type AccessLevel } from "../domain/access-policy";
import { resolveEffectiveStatus, type Subscription } from "../domain/subscription";
import type { SubscriptionRepository } from "../repository/subscription-repository";

/**
 * Mission 028, Section 6 — the single authoritative
 * `canAccess(organizationId, capability)`-equivalent mechanism.
 * Everything that needs to gate a capability or check a usage limit —
 * server actions, API route handlers, page components, ConversionService
 * — goes through this one service, never a locally re-derived plan/
 * subscription comparison. This is also Section 23's answer to
 * "avoid entitlement database queries scattered through every
 * component": the one `SubscriptionRepository.getByBusinessId` query
 * per decision lives here, not repeated in every caller.
 *
 * Deliberately thin: it resolves the subscription (tenant-scoped by
 * `businessId`, so Section 18's isolation guarantee falls straight
 * out of the repository's own `WHERE business_id = ?`) and hands off
 * to the pure decision functions in domain/access.ts. No caching layer
 * — Section 23 also says not to introduce premature distributed
 * caching; a single indexed lookup per decision is already cheap
 * enough not to need one yet.
 */
export class EntitlementService {
  constructor(private readonly subscriptionRepository: SubscriptionRepository) {}

  async getSubscription(businessId: string): Promise<Subscription | null> {
    return this.subscriptionRepository.getByBusinessId(businessId);
  }

  /**
   * Mission 029, Section 11 — `now` defaults to the real clock here,
   * at the service boundary, exactly like requireCurrentSession()
   * being the one place a request's identity is resolved. Everything
   * this method calls after that (resolveEffectiveStatus,
   * evaluateCapabilityAccess) receives `now` explicitly and has no
   * clock access of its own. This makes a trial that expired one
   * second ago correctly deny access even if
   * SubscriptionLifecycleService.reconcileElapsed hasn't run against
   * this row yet — evaluation is decoupled from persistence (see that
   * method's doc comment) — while never *writing* on a read path.
   */
  async canAccess(businessId: string, capability: Capability, now: Date = new Date()): Promise<AccessDecision> {
    const subscription = await this.subscriptionRepository.getByBusinessId(businessId);
    if (!subscription) return { allowed: false, reason: "NO_SUBSCRIPTION" };
    return evaluateCapabilityAccess(effectiveSubscription(subscription, now), capability);
  }

  async checkLimit(
    businessId: string,
    key: LimitKey,
    currentUsage: number,
    now: Date = new Date()
  ): Promise<LimitDecision> {
    const subscription = await this.subscriptionRepository.getByBusinessId(businessId);
    if (!subscription) return { allowed: false, reason: "NO_SUBSCRIPTION", limit: null, currentUsage };
    return evaluateLimit(effectiveSubscription(subscription, now), key, currentUsage);
  }

  /**
   * Mission 029, Section 13/27 — the settings UI's one call for
   * "what tier of access is this business in right now, and what
   * should we tell them about it", instead of re-deriving
   * `subscription.status === "past_due"` locally. See
   * domain/access-policy.ts for the three levels.
   */
  async getAccessLevel(businessId: string, now: Date = new Date()): Promise<AccessLevel | "no_subscription"> {
    const subscription = await this.subscriptionRepository.getByBusinessId(businessId);
    if (!subscription) return "no_subscription";
    return accessLevelForStatus(effectiveSubscription(subscription, now).status);
  }

  /**
   * Mission 029, Section 14 — resolves whether creating one more
   * `key`-limited resource is even worth attempting, and the numeric
   * cap to enforce, *without* requiring the caller to already know
   * current usage. Exists specifically so a caller can request this
   * gate once, then perform the count-and-insert atomically in a
   * single database transaction (see
   * inventory/repository/database-vehicle-repository.ts's
   * `createWithinLimit`) — folding the usage count into this method
   * the way `checkLimit` does would put the count-read and the
   * insert back in two separate awaited steps, reopening the
   * check-then-insert race Section 14 asks to close.
   */
  async resolveLimitGate(
    businessId: string,
    key: LimitKey,
    now: Date = new Date()
  ): Promise<{ ok: true; limit: number | null } | { ok: false; reason: "NO_SUBSCRIPTION" | "SUBSCRIPTION_INACTIVE" }> {
    const subscription = await this.subscriptionRepository.getByBusinessId(businessId);
    if (!subscription) return { ok: false, reason: "NO_SUBSCRIPTION" };
    const effective = effectiveSubscription(subscription, now);
    if (accessLevelForStatus(effective.status) === "locked") {
      return { ok: false, reason: "SUBSCRIPTION_INACTIVE" };
    }
    return { ok: true, limit: limitFor(effective.plan, key) };
  }
}

function effectiveSubscription(subscription: Subscription, now: Date): Subscription {
  const status = resolveEffectiveStatus(subscription, now);
  return status === subscription.status ? subscription : { ...subscription, status };
}

import type { Capability, LimitKey } from "./plan";
import { hasCapability, limitFor } from "./plan";
import type { Subscription } from "./subscription";
import { statusGrantsAccess } from "./subscription";

/**
 * Mission 028, Section 6/24 — the single authoritative
 * `canAccess`-style decision, and Section 24's "organization,
 * capability, decision, reason" observability shape in one type. Every
 * caller (EntitlementService, and anything that calls it) gets the
 * same structured answer, never just a bare boolean — a future
 * support/admin tool can render `reason` directly without re-deriving
 * it from raw plan/subscription rows.
 */
export type AccessDecision = {
  allowed: boolean;
  reason: AccessDecisionReason;
};

export type AccessDecisionReason =
  | "NO_SUBSCRIPTION"
  | "SUBSCRIPTION_INACTIVE"
  | "PLAN_DOES_NOT_INCLUDE_CAPABILITY"
  | "CAPABILITY_GRANTED";

/**
 * The capability half of Section 6's `canAccess(organizationId,
 * capability)`: given the subscription a business already has
 * (resolved by EntitlementService, tenant-scoped), does it grant this
 * capability right now? Two checks, in order — subscription status
 * first (an expired/cancelled subscription can't be rescued by an
 * otherwise-entitled plan), then the plan's own capability list.
 */
export function evaluateCapabilityAccess(subscription: Subscription, capability: Capability): AccessDecision {
  if (!statusGrantsAccess(subscription.status)) {
    return { allowed: false, reason: "SUBSCRIPTION_INACTIVE" };
  }
  if (!hasCapability(subscription.plan, capability)) {
    return { allowed: false, reason: "PLAN_DOES_NOT_INCLUDE_CAPABILITY" };
  }
  return { allowed: true, reason: "CAPABILITY_GRANTED" };
}

export type LimitDecision = {
  allowed: boolean;
  reason: LimitDecisionReason;
  /** null when the plan has no limit for this key (unlimited). */
  limit: number | null;
  currentUsage: number;
};

export type LimitDecisionReason =
  | "NO_SUBSCRIPTION"
  | "SUBSCRIPTION_INACTIVE"
  | "LIMIT_EXCEEDED"
  | "WITHIN_LIMIT"
  | "UNLIMITED";

/**
 * Section 9's usage-limit check — deliberately separate from
 * capability access (a plan can have a feature enabled and still cap
 * how much of it can be used). `currentUsage` is supplied by the
 * caller (EntitlementService composes it from the relevant
 * repository — e.g. VehicleRepository.countByStatus for the
 * "vehicles" limit) rather than computed in here, so this function
 * stays a pure decision with no database access of its own — Section
 * 23's "avoid entitlement database queries scattered through every
 * component" is about keeping the *query* centralized in the service
 * layer, not about this function reaching for the database itself.
 */
export function evaluateLimit(subscription: Subscription, key: LimitKey, currentUsage: number): LimitDecision {
  if (!statusGrantsAccess(subscription.status)) {
    return { allowed: false, reason: "SUBSCRIPTION_INACTIVE", limit: null, currentUsage };
  }
  const limit = limitFor(subscription.plan, key);
  if (limit === null) {
    return { allowed: true, reason: "UNLIMITED", limit: null, currentUsage };
  }
  if (currentUsage >= limit) {
    return { allowed: false, reason: "LIMIT_EXCEEDED", limit, currentUsage };
  }
  return { allowed: true, reason: "WITHIN_LIMIT", limit, currentUsage };
}

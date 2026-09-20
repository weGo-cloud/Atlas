import type { SubscriptionStatus } from "../domain/subscription";
import type { UpdateSubscriptionInput } from "../repository/subscription-repository";

/**
 * Mission 029, Section 9 — "prepare the domain for future provider
 * events ... establish a clean internal event boundary if necessary.
 * Do NOT implement real webhooks." This is that boundary: a closed
 * event-type union and one pure mapping function. There is no HTTP
 * route that produces these events yet (that's the future provider
 * integration mission's job — it would add e.g.
 * `/api/webhooks/[provider]/route.ts`, verify the provider's
 * signature, construct one of these events, and call
 * `applyBillingEvent`). Nothing here trusts a client request as proof
 * of payment (Section 9's explicit warning) — this module has no
 * caller in M029 at all; it exists purely so that future integration
 * has a typed, tested target to build against.
 */
export type BillingEvent =
  | { type: "subscription.created"; businessId: string; plan: string; providerStatus: string; occurredAt: string }
  | { type: "subscription.updated"; businessId: string; providerStatus: string; occurredAt: string }
  | { type: "subscription.cancelled"; businessId: string; occurredAt: string }
  | { type: "payment.succeeded"; businessId: string; occurredAt: string }
  | { type: "payment.failed"; businessId: string; occurredAt: string };

/**
 * Maps a provider's own status vocabulary onto Atlas's
 * SubscriptionStatus. Necessarily provider-specific in shape (every
 * processor names its statuses differently), which is exactly why
 * this lives in the billing/ boundary rather than domain/subscription.ts
 * — the core domain must stay unaware that "past_due" is spelled
 * differently in any given provider's webhook payload.
 */
const PROVIDER_STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  paused: "paused",
  canceled: "cancelled",
  cancelled: "cancelled",
  expired: "expired",
};

/**
 * Pure translation from a BillingEvent to the patch
 * SubscriptionLifecycleService/SubscriptionRepository would apply —
 * no database access, no side effects, same discipline as
 * domain/access.ts's evaluate* functions. Returns null for event
 * types that don't map onto a status change (a future integration
 * would still record `payment.succeeded`/`payment.failed` for
 * observability without necessarily changing `status` itself, since
 * a single failed charge inside an existing grace period doesn't need
 * a transition).
 */
export function applyBillingEvent(event: BillingEvent): UpdateSubscriptionInput | null {
  switch (event.type) {
    case "subscription.created":
    case "subscription.updated": {
      const status = PROVIDER_STATUS_MAP[event.providerStatus];
      return status ? { status } : null;
    }
    case "subscription.cancelled":
      return { status: "cancelled", cancelAtPeriodEnd: false };
    case "payment.succeeded":
    case "payment.failed":
      return null;
  }
}

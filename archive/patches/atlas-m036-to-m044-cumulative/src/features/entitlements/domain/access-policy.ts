import type { SubscriptionStatus } from "./subscription";

/**
 * Mission 029, Section 13 — "define what happens when a subscription
 * becomes past due/paused/cancelled/expired ... create a centralized
 * access policy so the application does not contain scattered logic
 * such as `if (status === "expired")` in dozens of locations."
 *
 * Deliberately the minimum policy the current product needs (Section
 * 13's own closing instruction), not a general four-tier
 * fully-available/restricted/read-only/unavailable framework: nothing
 * in Atlas today has a "read-only" mode for a whole business (there's
 * no per-capability read/write split anywhere in the codebase), so
 * introducing one here would be exactly the "don't invent business
 * policies arbitrarily" / "don't over-engineer" this section warns
 * against. Three levels cover every case Atlas actually has:
 *
 * - "full": trialing/active — plan capabilities and limits apply
 *   normally (evaluateCapabilityAccess / evaluateLimit already do
 *   this; this policy doesn't re-decide it, only labels it).
 * - "grace": past_due — Section 10/subscription.ts's existing
 *   "billing failed but access continues for now" state. Everything
 *   still works; this level exists purely so the UI can show a
 *   warning banner (Section 27: diagnosable, not silent) without a
 *   local `status === "past_due"` check.
 * - "locked": paused/cancelled/expired — no paid capability is
 *   granted (evaluateCapabilityAccess/evaluateLimit already enforce
 *   this via SUBSCRIPTION_INACTIVE). Existing *data* is never
 *   touched by this — see Section 6's "downgrade does not delete
 *   data" rule, which applies equally to a locked subscription: rows
 *   already in the database stay exactly as they are, this policy
 *   only concerns what new capability/limit checks return.
 */
export const ACCESS_LEVELS = ["full", "grace", "locked"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

const GRACE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["past_due"]);
const FULL_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["trialing", "active"]);

export function accessLevelForStatus(status: SubscriptionStatus): AccessLevel {
  if (FULL_STATUSES.has(status)) return "full";
  if (GRACE_STATUSES.has(status)) return "grace";
  return "locked";
}

/** One line of user-facing copy per level — the single place this wording lives, so the settings UI and any future banner/email never restate it independently. */
export function accessLevelMessage(level: AccessLevel): string | null {
  switch (level) {
    case "full":
      return null;
    case "grace":
      return "Your last payment attempt failed. Access continues for now — please update billing to avoid interruption.";
    case "locked":
      return "This subscription isn't active. Plan capabilities are unavailable until it's resumed or a new plan is selected. Your existing data is safe and untouched.";
  }
}

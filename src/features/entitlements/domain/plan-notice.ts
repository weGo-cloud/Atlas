import { planDefinition, STARTER_ITEM_LIMIT } from "./plan";
import type { EffectiveSubscription } from "./subscription";

/**
 * Mission 036 — the single source of copy for the trial/fallback
 * banners, mirroring `accessLevelMessage`'s role for access levels.
 * Pure: `now` is passed in, nothing reads the clock. A banner is a
 * display concern only; every access decision still goes through
 * EntitlementService.
 */
export type PlanNotice =
  | { kind: "trial_active"; daysLeft: number; message: string }
  | { kind: "trial_ended"; message: string }
  | { kind: "subscription_ended"; message: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days remaining, rounded up, never below 1 while the trial is still running. */
export function trialDaysLeft(trialEndsAt: string, now: Date): number {
  const remaining = new Date(trialEndsAt).getTime() - now.getTime();
  return Math.max(1, Math.ceil(remaining / DAY_MS));
}

const UPGRADE_RESTORES = "the storefront, website/chatbot connection, social posts and Everest";

export function planNotice(effective: EffectiveSubscription, now: Date): PlanNotice | null {
  const { subscription, fallback } = effective;
  if (fallback === "trial_ended") {
    return {
      kind: "trial_ended",
      message: `Your free trial has ended, so you're now on the free ${planDefinition("starter").name} plan (up to ${STARTER_ITEM_LIMIT} items). Your data is safe and nothing was deleted. Upgrade to bring back ${UPGRADE_RESTORES}.`,
    };
  }
  if (fallback === "subscription_ended") {
    return {
      kind: "subscription_ended",
      message: `Your subscription has ended, so you're now on the free ${planDefinition("starter").name} plan. Your data is safe and nothing was deleted. Upgrade to bring back ${UPGRADE_RESTORES}.`,
    };
  }
  if (subscription.status === "trialing" && subscription.trialEndsAt !== null) {
    const daysLeft = trialDaysLeft(subscription.trialEndsAt, now);
    return {
      kind: "trial_active",
      daysLeft,
      message: `Your free trial has ${daysLeft} day${daysLeft === 1 ? "" : "s"} left with every Atlas feature switched on. After that you'll move to the free ${planDefinition("starter").name} plan — your data stays.`,
    };
  }
  return null;
}

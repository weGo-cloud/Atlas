"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { ForbiddenError, requirePermission } from "@/features/auth/domain/permissions";
import { getSubscriptionLifecycleService } from "../service";
import type { Subscription } from "../domain/subscription";
import { isSubscriptionPlan } from "../domain/plan";
import { InvalidSubscriptionTransitionError } from "../domain/lifecycle";
import { NoSubscriptionError, PlanNotAssignableError } from "../service/subscription-lifecycle-service";

export type SubscriptionActionResult =
  | { ok: true; subscription: Subscription }
  | { ok: false; error: { message: string } };

/**
 * Mission 029, Section 5/17/19 — the one write path for subscription
 * state, mirroring business-settings-actions.ts's shape exactly:
 * requireCurrentSession → requirePermission("business.manage") →
 * service. This is also the mission's answer to Section 17
 * ("if Atlas already has an administrative concept, provide a safe
 * internal mechanism...") — Atlas's only administrative concept is
 * the owner role (permissions.ts), so these actions being owner-gated
 * *is* that mechanism; there is no separate internal-admin system to
 * build one on top of. Every plan/status value taken here is
 * validated against the real domain enums before reaching the
 * service — nothing client-supplied is trusted as-is (Section 19).
 */
async function requireBusinessManage() {
  const session = await requireCurrentSession();
  try {
    requirePermission(session, "business.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw new PermissionDenied(error.message);
    }
    throw error;
  }
  return session;
}

class PermissionDenied extends Error {}

function toErrorMessage(error: unknown): string {
  if (error instanceof PlanNotAssignableError) {
    return `The "${error.plan}" plan isn't currently available to switch to.`;
  }
  if (error instanceof InvalidSubscriptionTransitionError) {
    return `Your subscription can't move from "${error.from}" to "${error.to}" right now.`;
  }
  if (error instanceof NoSubscriptionError) {
    return "No subscription was found for this business.";
  }
  return "Something went wrong updating your subscription. Please try again.";
}

export async function changePlanAction(plan: string): Promise<SubscriptionActionResult> {
  let session;
  try {
    session = await requireBusinessManage();
  } catch (error) {
    if (error instanceof PermissionDenied) return { ok: false, error: { message: error.message } };
    throw error;
  }

  if (!isSubscriptionPlan(plan)) {
    return { ok: false, error: { message: "That plan doesn't exist." } };
  }

  try {
    const subscription = await getSubscriptionLifecycleService().changePlan(session.business.id, plan);
    revalidatePath("/app/settings");
    return { ok: true, subscription };
  } catch (error) {
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export async function cancelSubscriptionAction(
  mode: "immediate" | "at_period_end"
): Promise<SubscriptionActionResult> {
  let session;
  try {
    session = await requireBusinessManage();
  } catch (error) {
    if (error instanceof PermissionDenied) return { ok: false, error: { message: error.message } };
    throw error;
  }

  try {
    const subscription = await getSubscriptionLifecycleService().cancel(session.business.id, mode);
    revalidatePath("/app/settings");
    return { ok: true, subscription };
  } catch (error) {
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

export async function resumeSubscriptionAction(): Promise<SubscriptionActionResult> {
  let session;
  try {
    session = await requireBusinessManage();
  } catch (error) {
    if (error instanceof PermissionDenied) return { ok: false, error: { message: error.message } };
    throw error;
  }

  try {
    const subscription = await getSubscriptionLifecycleService().resume(session.business.id);
    revalidatePath("/app/settings");
    return { ok: true, subscription };
  } catch (error) {
    return { ok: false, error: { message: toErrorMessage(error) } };
  }
}

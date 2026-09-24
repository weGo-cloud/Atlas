"use server";

import { revalidatePath } from "next/cache";

import { getActivityService } from "@/features/activities/service";
import type { DealActivityMetadata } from "@/features/activities/domain/activity";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { getDealService } from "../service";
import type { Deal, DealStatus } from "../domain/deal";
import type { DealServiceError } from "../domain/errors";
import type { CreateDealInput, UpdateDealInput } from "../domain/deal-input";

export type DealActionResult =
  | { ok: true; deal: Deal }
  | { ok: false; error: DealServiceError };

function revalidateDealPaths(deal: Deal) {
  revalidatePath("/app/deals");
  revalidatePath(`/app/deals/${deal.id}`);
  revalidatePath(`/app/customers/${deal.customerId}`);
  revalidatePath(`/app/leads/${deal.leadId}`);
  if (deal.vehicleId) {
    revalidatePath(`/app/inventory/${deal.vehicleId}`);
  }
  // Dashboard shows lead/vehicle status-derived counts; a deal
  // transition can change a vehicle's status (reserved/sold), so bust
  // it the same way lead-actions.ts and vehicle-actions.ts already do.
  revalidatePath("/app/dashboard");
  revalidatePath("/app/analytics");
}

/**
 * Mission 018 — same pattern as lead-actions.ts's recordActivity: the
 * one place every automatic Deal activity is generated, immediately
 * after the mutation it describes succeeds. A failure here is
 * deliberately swallowed — see lead-actions.ts's recordActivity for
 * the full rationale, which applies identically here.
 */
async function recordActivity(
  businessId: string,
  actorUserId: string,
  input: {
    customerId: string;
    leadId: string;
    type: "deal_created" | "deal_status_changed";
    content: string;
    metadata: DealActivityMetadata;
  }
): Promise<void> {
  try {
    await getActivityService(businessId).createActivity({ ...input, userId: actorUserId });
  } catch {
    // Best-effort — see function comment.
  }
}

export async function createDealAction(input: CreateDealInput): Promise<DealActionResult> {
  const { business, user } = await requireCurrentSession();
  const result = await getDealService(business.id).createDeal(input);
  if (!result.ok) return { ok: false, error: result.error };

  await recordActivity(business.id, user.id, {
    customerId: result.data.customerId,
    leadId: result.data.leadId,
    type: "deal_created",
    content: result.data.vehicleLabel
      ? `Deal opened for ${result.data.vehicleLabel}.`
      : "Deal opened.",
    metadata: { dealId: result.data.id },
  });

  revalidateDealPaths(result.data);
  return { ok: true, deal: result.data };
}

export async function updateDealAction(id: string, input: UpdateDealInput): Promise<DealActionResult> {
  const { business } = await requireCurrentSession();
  const result = await getDealService(business.id).updateDeal(id, input);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateDealPaths(result.data);
  return { ok: true, deal: result.data };
}

export async function updateDealStatusAction(id: string, targetStatus: DealStatus): Promise<DealActionResult> {
  const { business, user } = await requireCurrentSession();
  const dealService = getDealService(business.id);

  const before = await dealService.getDeal(id);
  const previousStatus = before.ok ? before.data.status : null;

  const result = await dealService.updateDealStatus(id, targetStatus);
  if (!result.ok) return { ok: false, error: result.error };

  if (previousStatus) {
    await recordActivity(business.id, user.id, {
      customerId: result.data.customerId,
      leadId: result.data.leadId,
      type: "deal_status_changed",
      content: `Deal status changed from "${previousStatus}" to "${result.data.status}".`,
      metadata: { dealId: result.data.id, fromStatus: previousStatus, toStatus: result.data.status },
    });
  }

  revalidateDealPaths(result.data);
  return { ok: true, deal: result.data };
}

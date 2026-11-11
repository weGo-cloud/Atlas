"use server";

import { revalidatePath } from "next/cache";

import { getActivityService } from "@/features/activities/service";
import { getLeadService } from "../service";
import type { Lead, LeadStatus } from "../domain/lead";
import type { LeadServiceError } from "../domain/errors";
import type { CreateLeadInput, UpdateLeadInput } from "../domain/lead-input";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export type LeadActionResult =
  | { ok: true; lead: Lead }
  | { ok: false; error: LeadServiceError };

function revalidateLeadPaths(lead: Lead) {
  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${lead.id}`);
  revalidatePath(`/app/customers/${lead.customerId}`);
  if (lead.vehicleId) {
    revalidatePath(`/app/inventory/${lead.vehicleId}`);
  }
  // Dashboard shows lead status counts and most-interested vehicles.
  revalidatePath("/app/dashboard");
  revalidatePath("/app/analytics");
}

/**
 * Mission 017 — every automatic activity in Atlas is generated right
 * here, in the server action, immediately after the Lead mutation it
 * describes succeeds. This is the one place that does it: LeadService
 * has no knowledge of Activity at all, and no UI code ever calls
 * ActivityService directly for these events — so there is exactly one
 * call site per automatic event, never two, and never a UI-triggered
 * duplicate of a service-triggered one.
 *
 * A failure here is deliberately swallowed rather than failing the
 * whole action: the Lead mutation that already succeeded is real and
 * should not be rolled back or reported as an error just because its
 * (secondary, historical) activity record couldn't be written. Losing
 * one timeline entry is a far smaller problem than telling staff their
 * status change failed when it didn't.
 */
async function recordActivity(
  businessId: string,
  actorUserId: string,
  input: Omit<Parameters<ReturnType<typeof getActivityService>["createActivity"]>[0], "userId">
): Promise<void> {
  try {
    await getActivityService(businessId).createActivity({ ...input, userId: actorUserId });
  } catch {
    // Best-effort — see function comment.
  }
}

export async function createLeadAction(
  input: CreateLeadInput
): Promise<LeadActionResult> {
  const { business, user } = await requireCurrentSession();
  const result = await getLeadService(business.id).createLead(input);
  if (!result.ok) return { ok: false, error: result.error };

  await recordActivity(business.id, user.id, {
    customerId: result.data.customerId,
    leadId: result.data.id,
    type: "lead_created",
    content: result.data.vehicleLabel
      ? `Lead created for ${result.data.vehicleLabel}.`
      : "Lead created.",
  });

  revalidateLeadPaths(result.data);
  return { ok: true, lead: result.data };
}

export async function updateLeadAction(
  id: string,
  input: UpdateLeadInput
): Promise<LeadActionResult> {
  const { business, user } = await requireCurrentSession();
  const leadService = getLeadService(business.id);

  // Captured before the mutation so we can tell whether nextFollowUpAt
  // actually changed — the action is the only place with both the
  // "before" and "after" values, since LeadService.updateLead only
  // returns the final state.
  const before = await leadService.getLead(id);

  const result = await leadService.updateLead(id, input);
  if (!result.ok) return { ok: false, error: result.error };

  const previousFollowUpAt = before.ok ? before.data.nextFollowUpAt : null;
  if (result.data.nextFollowUpAt && result.data.nextFollowUpAt !== previousFollowUpAt) {
    await recordActivity(business.id, user.id, {
      customerId: result.data.customerId,
      leadId: result.data.id,
      type: "follow_up_scheduled",
      content: `Follow-up scheduled for ${result.data.nextFollowUpAt}.`,
      metadata: { followUpDate: result.data.nextFollowUpAt },
    });
  }

  revalidateLeadPaths(result.data);
  return { ok: true, lead: result.data };
}

export async function updateLeadStatusAction(
  id: string,
  targetStatus: LeadStatus
): Promise<LeadActionResult> {
  const { business, user } = await requireCurrentSession();
  const leadService = getLeadService(business.id);

  const before = await leadService.getLead(id);
  const previousStatus = before.ok ? before.data.status : null;

  const result = await leadService.updateLeadStatus(id, targetStatus);
  if (!result.ok) return { ok: false, error: result.error };

  if (previousStatus) {
    await recordActivity(business.id, user.id, {
      customerId: result.data.customerId,
      leadId: result.data.id,
      type: "status_change",
      content: `Status changed from "${previousStatus}" to "${result.data.status}".`,
      metadata: { fromStatus: previousStatus, toStatus: result.data.status },
    });
  }

  revalidateLeadPaths(result.data);
  return { ok: true, lead: result.data };
}

/** Mission 017 — the explicit follow-up-completion action Section 16 asks for. */
export async function completeLeadFollowUpAction(id: string): Promise<LeadActionResult> {
  const { business, user } = await requireCurrentSession();
  const leadService = getLeadService(business.id);

  const result = await leadService.completeFollowUp(id);
  if (!result.ok) return { ok: false, error: result.error };

  await recordActivity(business.id, user.id, {
    customerId: result.data.customerId,
    leadId: result.data.id,
    type: "follow_up_completed",
    content: "Follow-up completed.",
  });

  revalidateLeadPaths(result.data);
  return { ok: true, lead: result.data };
}

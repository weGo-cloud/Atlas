"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import type { Activity } from "../domain/activity";
import type { ActivityServiceError } from "../domain/errors";
import type { CreateManualActivityInput } from "../domain/activity-input";
import { getActivityService } from "../service";

export type ActivityActionResult =
  | { ok: true; activity: Activity }
  | { ok: false; error: ActivityServiceError };

/**
 * The one client-facing way to create an activity. `type` is
 * constrained to manual types by ActivityService itself — this action
 * adds no additional restriction beyond resolving the authenticated
 * actor server-side, which is the actual security boundary (never
 * `input`-supplied).
 */
export async function createManualActivityAction(
  input: CreateManualActivityInput
): Promise<ActivityActionResult> {
  const { business, user } = await requireCurrentSession();
  const result = await getActivityService(business.id).createManualActivity(input, user.id);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/app/customers/${result.data.customerId}`);
  if (result.data.leadId) {
    revalidatePath(`/app/leads/${result.data.leadId}`);
  }
  return { ok: true, activity: result.data };
}

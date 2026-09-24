"use server";

import { getConversionService } from "../service";
import type { ConversionServiceError } from "../domain/lead-intake";
import type { PublicLeadInput } from "../domain/lead-intake";

export type PublicLeadActionResult =
  | { ok: true; leadId: string }
  | { ok: false; error: ConversionServiceError };

/**
 * Mission 027 (correction) — the storefront's one public server
 * action. Deliberately takes no session (there isn't one — this is
 * called from an unauthenticated page, see src/app/site/[businessId])
 * and re-derives everything it's allowed to do from the entitlement
 * check inside ConversionService, never from client-supplied trust.
 * A businessId that isn't entitled/doesn't have the storefront
 * enabled fails here exactly the same way it would from a scripted
 * request — this action is not a looser path than the API route.
 */
export async function submitStorefrontLeadAction(
  businessId: string,
  input: PublicLeadInput
): Promise<PublicLeadActionResult> {
  const conversionService = getConversionService();

  const channelResult = await conversionService.resolveChannel(businessId, "storefront");
  if (!channelResult.ok) {
    return { ok: false, error: channelResult.error };
  }

  const leadResult = await conversionService.submitPublicLead(channelResult.data, "storefront", input);
  if (!leadResult.ok) {
    return { ok: false, error: leadResult.error };
  }

  return { ok: true, leadId: leadResult.data.leadId };
}

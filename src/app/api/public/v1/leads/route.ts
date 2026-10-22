import { NextResponse } from "next/server";

import { getConversionService } from "@/features/conversion/service";
import { authenticatePublicApi, preflightResponse } from "@/features/conversion/lib/public-api-auth";
import type { PublicLeadInput } from "@/features/conversion/domain/lead-intake";

/**
 * Mission 027 (correction) — the external-integration API's write side: a
 * business's own website posts a lead capture form here, so Atlas is the CRM
 * behind it. Same auth posture as the inventory route (Mission 037: shared
 * gate in features/conversion/lib/public-api-auth.ts), with tighter limits
 * because every accepted request writes a row.
 */
const METHODS = "POST, OPTIONS";

export async function OPTIONS() {
  return preflightResponse(METHODS);
}

export async function POST(request: Request) {
  const auth = await authenticatePublicApi(request, METHODS, { perIpPerMinute: 20, perKeyPerMinute: 30 }, "leads");
  if (!auth.ok) return auth.response;

  let body: PublicLeadInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: auth.cors });
  }

  const conversionService = getConversionService();
  const channelResult = await conversionService.resolveChannel(auth.business.id, "external_integration");
  if (!channelResult.ok) {
    return NextResponse.json({ error: channelResult.error.message }, { status: 403, headers: auth.cors });
  }

  const leadResult = await conversionService.submitPublicLead(channelResult.data, "external_integration", body);
  if (!leadResult.ok) {
    return NextResponse.json(
      { error: leadResult.error.message, fieldErrors: leadResult.error.fieldErrors },
      { status: 422, headers: auth.cors }
    );
  }

  return NextResponse.json({ leadId: leadResult.data.leadId }, { status: 201, headers: auth.cors });
}
